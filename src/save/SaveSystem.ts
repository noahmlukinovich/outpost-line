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
}

export interface MissionProgress {
  stars: number;
  bestIntegrity: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  missions: Record<string, MissionProgress>;
}

function defaults(): SaveData {
  return {
    version: VERSION,
    settings: { damageNumbers: true, screenShake: true, sound: true },
    missions: {},
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
}

export const save = new SaveSystem();
