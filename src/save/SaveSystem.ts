/**
 * Save data: settings and mission progress, stored in localStorage as versioned JSON.
 *
 * Everything else in the game goes through this module, so switching storage later (e.g. to
 * IndexedDB) only touches this file. Bump VERSION and add a migration when the shape changes.
 * Note: iPadOS keeps home-screen web app storage, but clearing Safari website data erases it.
 */
import { Missions } from '../data/missions';
import { Tech } from '../data/tech';
import type { HeroDef, MissionDef } from '../data/types';

const KEY = 'outpost-line/save';
const VERSION = 2;

export interface Settings {
  damageNumbers: boolean;
  screenShake: boolean;
  sound: boolean;
  /** High-quality effects (casings, extra particles, ambient dust). */
  effectsHigh: boolean;
}

export interface MissionProgress {
  stars: number;
  bestIntegrity: number;
}

export interface EndlessRun {
  waves: number;
  kills: number;
  /** ISO date string. */
  date: string;
}

export interface SaveData {
  version: number;
  settings: Settings;
  missions: Record<string, MissionProgress>;
  /** Best endless runs per mission id, best first (top 5). */
  endless: Record<string, EndlessRun[]>;
  /** Tech-tree nodes bought with stars. */
  tech: string[];
  /** Hero chosen in the last briefing. */
  hero: string;
}

function defaults(): SaveData {
  return {
    version: VERSION,
    settings: { damageNumbers: true, screenShake: true, sound: true, effectsHigh: true },
    missions: {},
    endless: {},
    tech: [],
    hero: 'kastellan',
  };
}

function migrate(raw: unknown): SaveData {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  // v1 is the first version; future migrations go here (if (r.version === 1) { ... }).
  return {
    version: VERSION,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    missions: { ...(r.missions ?? {}) },
    endless: { ...(r.endless ?? {}) },
    // v1 → v2: tech tree and hero choice added (defaults).
    tech: Array.isArray(r.tech) ? r.tech : [],
    hero: typeof r.hero === 'string' ? r.hero : 'kastellan',
  };
}

class SaveSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const text = localStorage.getItem(KEY);
      return text ? migrate(JSON.parse(text)) : defaults();
    } catch {
      return defaults();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked (private browsing): keep playing with in-memory data.
    }
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data.settings[key] = value;
    this.persist();
  }

  mission(id: string): MissionProgress | undefined {
    return this.data.missions[id];
  }

  /** Record a result; keeps the best stars/integrity. */
  recordMission(id: string, stars: number, integrity: number): void {
    const prev = this.data.missions[id];
    this.data.missions[id] = {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestIntegrity: Math.max(prev?.bestIntegrity ?? 0, integrity),
    };
    this.persist();
  }

  endlessRuns(id: string): EndlessRun[] {
    return this.data.endless[id] ?? [];
  }

  /** Record an endless run; returns its rank (0 = new best) or -1 if it didn't make the top 5. */
  recordEndless(id: string, waves: number, kills: number): number {
    const runs = [...this.endlessRuns(id)];
    const run: EndlessRun = { waves, kills, date: new Date().toISOString() };
    runs.push(run);
    runs.sort((a, b) => b.waves - a.waves || b.kills - a.kills);
    runs.length = Math.min(runs.length, 5);
    this.data.endless[id] = runs;
    this.persist();
    return runs.indexOf(run);
  }

  // ---------------------------------------------------------------- campaign progress

  /** Campaign missions in order (endless excluded). */
  campaign(): MissionDef[] {
    return Missions.filter((m) => !m.endless);
  }

  missionUnlocked(id: string): boolean {
    const list = this.campaign();
    const i = list.findIndex((m) => m.id === id);
    if (i <= 0) return true;
    return (this.mission(list[i - 1].id)?.stars ?? 0) > 0;
  }

  heroUnlocked(h: HeroDef): boolean {
    return !h.unlockedBy || (this.mission(h.unlockedBy)?.stars ?? 0) > 0;
  }

  get selectedHero(): string {
    return this.data.hero;
  }

  set selectedHero(id: string) {
    this.data.hero = id;
    this.persist();
  }

  /** Stars from endless: 1 for wave 10, 2 for wave 20, 3 for wave 30 (best run). */
  endlessStars(id = 'endless01'): number {
    const best = this.endlessRuns(id)[0]?.waves ?? 0;
    return best >= 30 ? 3 : best >= 20 ? 2 : best >= 10 ? 1 : 0;
  }

  totalStars(): number {
    let n = this.endlessStars();
    for (const m of this.campaign()) n += this.mission(m.id)?.stars ?? 0;
    return n;
  }

  get techOwned(): readonly string[] {
    return this.data.tech;
  }

  spentStars(): number {
    return this.data.tech.reduce((a, id) => a + (Tech.find((t) => t.id === id)?.cost ?? 0), 0);
  }

  availableStars(): number {
    return this.totalStars() - this.spentStars();
  }

  /** Why a tech node can't be bought ('' = it can). */
  checkTech(id: string): string {
    const node = Tech.find((t) => t.id === id);
    if (!node) return 'Unknown';
    if (this.data.tech.includes(id)) return 'Owned';
    if (node.requires && !this.data.tech.includes(node.requires)) return 'Requires the previous upgrade';
    if (this.availableStars() < node.cost) return `Needs ${node.cost}★`;
    return '';
  }

  buyTech(id: string): boolean {
    if (this.checkTech(id)) return false;
    this.data.tech.push(id);
    this.persist();
    return true;
  }

  respec(): void {
    this.data.tech = [];
    this.persist();
  }
}

export const save = new SaveSystem();
