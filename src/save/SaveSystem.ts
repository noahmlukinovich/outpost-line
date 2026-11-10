/**
 * Save data: settings and mission progress, stored in localStorage as versioned JSON.
 *
 * Everything else in the game goes through this module, so switching storage later (e.g. to
 * IndexedDB) only touches this file. Bump VERSION and add a migration when the shape changes.
 * Note: iPadOS keeps home-screen web app storage, but clearing Safari website data erases it.
 */
const KEY = 'outpost-line/save';
const VERSION = 1;

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
}

function defaults(): SaveData {
  return {
    version: VERSION,
    settings: { damageNumbers: true, screenShake: true, sound: true, effectsHigh: true },
    missions: {},
    endless: {},
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
}

export const save = new SaveSystem();
