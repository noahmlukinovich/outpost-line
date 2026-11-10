/**
 * Types for all game data. These describe the SHAPE of the balance files; the numbers live in
 * units.ts, specs.ts, buildings.ts, enemies.ts, cover.ts, balance.ts and waves/*.ts.
 * If you mistype a field name there, the build fails and points at the line.
 */

export type DamageType = 'ballistic' | 'explosive' | 'ap' | 'fire' | 'energy';

/** How a squad picks among valid targets. */
export type TargetMode = 'first' | 'strongest' | 'weakest' | 'closest';

/** Tech level 1–3, unlocked by total Power from Reactors (see Balance.techPower). */
export type Tech = 1 | 2 | 3;

export interface WeaponDef {
  /** Damage per shot (before armor/shields). */
  damage: number;
  /** Shots per second, per firing trooper (or per weapon if the unit is `crewServed`). */
  rof: number;
  /** Range in world units (the map is 1440 × 900). */
  range: number;
  damageType: DamageType;
  /** 0–1. Chance a bullet hits. Misses still draw a tracer. */
  accuracy: number;
  /** If set, the weapon fires a projectile that explodes in this radius instead of an instant bullet. */
  splashRadius?: number;
  /** Projectile speed (units/sec). Only used with splashRadius. */
  projectileSpeed?: number;
  /** How the projectile looks/flies: lobbed grenade shell (default) or straight rocket. */
  projectile?: 'shell' | 'rocket';
}

/**
 * Effects are the building blocks of specializations and abilities. Each is a small rule the
 * simulation knows how to apply. Combine them freely in specs.ts.
 */
export type Effect =
  /** Multiply (or add to) a squad stat. */
  | { kind: 'stat'; stat: StatName; mult?: number; add?: number }
  /** Applied to every enemy this squad hits. */
  | { kind: 'onHit'; status: 'slow' | 'mark' | 'stun' | 'suppress' | 'burn'; strength: number; duration: number }
  /** Extra damage multiplier against shields. */
  | { kind: 'shieldMult'; mult: number }
  /** Extra damage multiplier against enemies with armor ≥ 0.3. */
  | { kind: 'armoredMult'; mult: number }
  /** Bullets continue through the target and hit up to `count` more enemies behind it (×dmgMult). */
  | { kind: 'pierceTargets'; count: number; dmgMult: number }
  /** Each volley fires at up to `count` different targets (×dmgMult each). */
  | { kind: 'multishot'; count: number; dmgMult: number }
  /** First shot at a new target deals ×mult. */
  | { kind: 'firstShot'; mult: number }
  /** Fire rate ramps up to +maxBonus (e.g. 1 = double) after `seconds` of continuous fire. */
  | { kind: 'spinUp'; maxBonus: number; seconds: number }
  /** While in cover: range and fire-rate multipliers. */
  | { kind: 'coverBonus'; range: number; rof: number }
  /** Extra damage reduction for the squad itself (stacks with cover). */
  | { kind: 'armor'; reduction: number }
  /** Flamethrower burst every `interval` s at enemies within `range` in a cone. */
  | { kind: 'flame'; interval: number; range: number; arcDeg: number; damage: number; burnDps: number; burnTime: number }
  /** Thrown grenade every `interval` s: splash damage that stuns. */
  | { kind: 'grenade'; interval: number; damage: number; radius: number; stun: number }
  /** Support aura for friendly squads within `radius`. */
  | { kind: 'aura'; radius: number; heal?: number; rof?: number; reinforce?: number }
  /** Instantly revive a Down squad within `radius`, then wait `cooldown` s. */
  | { kind: 'revive'; radius: number; cooldown: number }
  /** Deploy auto-turrets next to the squad. Multiple turret effects add up. */
  | { kind: 'turrets'; count: number; weapon?: WeaponDef }
  /** Multiplies turret damage / range. */
  | { kind: 'turretStat'; damage?: number; range?: number }
  /** Kills of enemies this squad marked pay extra bounty (0.5 = +50%). */
  | { kind: 'markBounty'; bonus: number }
  /** Can shoot flying enemies (fliers arrive in M3). */
  | { kind: 'antiAir' }
  /** Reveals cloaked enemies within `radius` (cloaked enemies arrive in M3). */
  | { kind: 'detect'; radius: number };

export type StatName = 'damage' | 'rof' | 'range' | 'accuracy' | 'splash' | 'hp' | 'blockCap' | 'pierce';

export interface TierDef {
  /** Supplies to buy this tier (tier I = placement price). */
  cost: number;
  weapon: WeaponDef;
  /** Hit points per trooper. */
  trooperHp: number;
  /** Short text shown in the upgrade panel. */
  blurb: string;
  /** Tech level needed to buy this tier. */
  tech?: Tech;
}

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  tech: Tech;
  effects: Effect[];
}

export interface SpecDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  tech: Tech;
  /** Replaces the tier III weapon. */
  weapon: WeaponDef;
  trooperHp?: number;
  arcDeg?: number;
  blockCap?: number;
  art?: string;
  leadArt?: string;
  /** Always-on effects of the specialization itself. */
  effects?: Effect[];
  /** 2–3 purchasable abilities. */
  abilities: AbilityDef[];
}

export interface UnitDef {
  id: string;
  name: string;
  /** Short role text for the build menu. */
  role: string;
  troopers: number;
  /** One weapon shared by the whole crew (heavy weapons, snipers) vs. one per trooper (rifles). */
  crewServed: boolean;
  /** Firing arc width, in degrees. */
  arcDeg: number;
  /** Placement footprint radius (nothing may overlap it). */
  footprint: number;
  /** How far the rally point may be dragged from where the squad was placed. */
  leash: number;
  /** Max number of melee enemies this squad can hold back at once (0 = never engaged). */
  blockCap: number;
  /** Command Cap used. */
  cap: number;
  art: string;
  leadArt?: string;
  tiers: [TierDef, TierDef, TierDef];
  /** The two specializations available after tier III. */
  specs: [string, string];
  /** Always-on effects of the base unit (e.g. engineers' small heal aura). */
  effects?: Effect[];
}

export interface BuildingTier {
  cost: number;
  /** Total power this building provides at this tier (Reactors). */
  power?: number;
  /** Supplies paid at the start of every wave (Supply Depots). */
  income?: number;
  /** Reveals cloaked enemies within this radius (Sensor Pylons). */
  detect?: number;
  blurb: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  role: string;
  footprint: number;
  art: string;
  tiers: [BuildingTier, BuildingTier, BuildingTier];
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
  /** Flies along the map's flight routes instead of the road. Grenades and flames can't hit it. */
  flier?: boolean;
  /** Invisible and untargetable unless revealed by a detector (or briefly after it attacks). */
  cloaked?: boolean;
  /** Can't be held back by squads (walks straight through). */
  unblockable?: boolean;
  /** Heals and recharges shields of other aliens nearby (per second). */
  healAura?: { radius: number; heal: number; shield: number };
  /** Dropship: flies in, hovers at the drop point, and unloads these troops onto the road. */
  carrier?: { troops: { enemy: string; count: number }[]; hover: number };
  /** Area stomp that hits every squad within `radius`. */
  stomp?: { radius: number; damage: number; rate: number };
  /** Boss phases: at each hp fraction, armor drops, speed rises and reinforcements appear. */
  phases?: { at: number[]; armorDrop: number; speedUp: number; spawn: { enemy: string; count: number } };
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
  /** Max Command Cap used by squads. */
  commandCap: number;
  /** Unit ids the player may build in this mission. */
  units: string[];
  /** Building ids the player may build in this mission. */
  buildings: string[];
  /** Endless survival: waves are generated forever (the `waves` list is ignored). */
  endless?: boolean;
}
