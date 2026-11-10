/**
 * Types for all game data. These describe the SHAPE of the balance files; the numbers live in
 * units.ts, enemies.ts, cover.ts, balance.ts and waves/*.ts. If you mistype a field name there,
 * the build will fail and point at the line.
 */

export type DamageType = 'ballistic' | 'explosive' | 'ap' | 'fire' | 'energy';

/** How a squad picks among valid targets. */
export type TargetMode = 'first' | 'strongest' | 'weakest' | 'closest';

export interface WeaponDef {
  /** Damage per shot (before armor/shields). */
  damage: number;
  /** Shots per second, per firing trooper (or per weapon if `crewServed`). */
  rof: number;
  /** Range in world units (1 unit ≈ 1 screen point at 100% zoom). */
  range: number;
  damageType: DamageType;
  /** 0–1. Chance a shot hits. Misses still draw a tracer. */
  accuracy: number;
  /** If set, the shot is a lobbed shell that explodes in this radius instead of an instant bullet. */
  splashRadius?: number;
  /** Shell flight speed (units/sec). Only used with splashRadius. */
  projectileSpeed?: number;
}

export interface TierDef {
  /** Supplies to buy this tier (tier I = placement cost). */
  cost: number;
  weapon: WeaponDef;
  /** Hit points per trooper. */
  trooperHp: number;
  /** Short text shown in the upgrade panel. */
  blurb: string;
}

export interface UnitDef {
  id: string;
  name: string;
  /** Short role text for the build menu. */
  role: string;
  /** Number of troopers in the squad. */
  troopers: number;
  /** One weapon shared by the whole crew (heavy weapons) vs. one per trooper (rifles). */
  crewServed: boolean;
  /** Firing arc width, in degrees. */
  arcDeg: number;
  /** Placement footprint radius (no two squads may overlap). */
  footprint: number;
  /** How far the rally point may be dragged from where the squad was placed. */
  leash: number;
  /** Max number of melee enemies this squad can hold back at once. */
  blockCap: number;
  /** Command Cap used (Command Cap arrives in M2). */
  cap: number;
  /** Art ID of the trooper sprite (see public/assets/manifest.json). */
  art: string;
  /** Optional different art for trooper #1 (e.g. the heavy gunner). */
  leadArt?: string;
  tiers: [TierDef, TierDef, TierDef];
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Shown in the wave preview: what this enemy is weak to. */
  hint: string;
  hp: number;
  /** Regenerating shield pool, absorbed before hp. 0 = none. */
  shield: number;
  /** Shield points regenerated per second (after `shieldDelay`). */
  shieldRegen: number;
  /** Seconds without being hit before the shield starts regenerating. */
  shieldDelay: number;
  /** 0–1. Fraction of damage blocked (reduced by the weapon's pierce). */
  armor: number;
  /** Move speed, units/sec. */
  speed: number;
  /** Supplies awarded on kill. */
  bounty: number;
  /** Outpost integrity lost if it reaches the exit. */
  leak: number;
  /** Collision/selection radius. */
  radius: number;
  attack: {
    /** 'melee' enemies stop to fight squads standing near the path; 'ranged' shoot while walking. */
    kind: 'melee' | 'ranged';
    damage: number;
    /** Attacks per second. */
    rate: number;
    /** Melee: how close a squad must be to get engaged. Ranged: shooting range. */
    range: number;
  };
  /** Below this hp fraction the enemy goes berserk (faster, hits harder). 0 = never. */
  berserkAt: number;
  art: string;
}

export interface CoverDef {
  id: string;
  name: string;
  /** 0–1: fraction of incoming damage removed for a squad in this cover. */
  damageReduction: number;
  /** Multiplier on weapon range (1.15 = +15%). */
  rangeBonus: number;
  /** How close the squad's position must be to count as "in" the cover. */
  radius: number;
  art: string;
}

export interface WaveGroup {
  enemy: string;
  count: number;
  /** Seconds between each spawn in this group. */
  interval: number;
  /** Seconds after the wave starts before this group begins. */
  delay: number;
  /** Which path to use (by name in the map). Omit for the map's first path. */
  path?: string;
}

export interface WaveDef {
  groups: WaveGroup[];
  /** Supplies paid when every enemy of this wave is dead. */
  clearBonus: number;
}

export interface MissionDef {
  id: string;
  name: string;
  briefing: string;
  /** Tiled map JSON (as a string). */
  mapJson: string;
  waves: WaveDef[];
  startingSupplies: number;
  integrity: number;
  /** Unit ids the player may build in this mission. */
  units: string[];
}
