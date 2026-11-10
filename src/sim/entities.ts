/** Simulation entities. Plain data; the World updates them, the renderer reads them. */
import type { BuildingDef, DamageType, EnemyDef, SpecDef, TargetMode, UnitDef } from '../data/types';
import type { Path } from '../maps/geometry';
import type { CoverPoint } from '../maps/loadMap';
import type { SquadStats } from './stats';

export interface Trooper {
  alive: boolean;
  hp: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Where the trooper's weapon points (radians). */
  angle: number;
  cooldown: number;
}

export interface Turret {
  x: number;
  y: number;
  angle: number;
  cooldown: number;
}

export interface Squad {
  kind: 'squad';
  id: number;
  def: UnitDef;
  /** 0 = I, 1 = II, 2 = III */
  tier: number;
  spec: SpecDef | null;
  /** Ability ids bought for the current spec. */
  abilities: string[];
  stats: SquadStats;
  /** Veterancy: XP from kills, rank 0–3. */
  xp: number;
  rank: number;
  /** Supplies spent on this squad (for sell refunds). */
  invested: number;
  /** Value of `World.wavesStarted` when placed (for free undo before the next wave). */
  placedAtWave: number;
  anchorX: number;
  anchorY: number;
  rallyX: number;
  rallyY: number;
  /** Current squad center (walks toward the rally point). */
  x: number;
  y: number;
  facing: number;
  targetMode: TargetMode;
  troopers: Trooper[];
  turrets: Turret[];
  cover: CoverPoint | null;
  down: boolean;
  downTimer: number;
  sinceHit: number;
  reinforceTimer: number;
  /** Number of melee enemies currently fighting this squad. */
  engagedBy: number;
  crewCooldown: number;
  flameCd: number;
  grenadeCd: number;
  reviveCd: number;
  /** Spin-up progress 0–1 (gatling). */
  spin: number;
  lastTargetId: number;
  target: Enemy | null;
  kills: number;
  removed: boolean;
  /** Buffs from friendly auras this tick. */
  auraRof: number;
  auraReinforce: number;
}

export interface Building {
  kind: 'building';
  id: number;
  def: BuildingDef;
  tier: number;
  invested: number;
  placedAtWave: number;
  x: number;
  y: number;
  removed: boolean;
}

export type Placeable = Squad | Building;

export interface Enemy {
  /** Unique per spawn; never reused (pooled objects get a new id). */
  id: number;
  def: EnemyDef;
  alive: boolean;
  path: Path;
  dist: number;
  /** Sideways offset from the path centerline, so crowds don't walk single-file. */
  lane: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  heading: number;
  hp: number;
  maxHp: number;
  shield: number;
  /** Shield capacity (def.shield × endless scaling). */
  maxShield: number;
  /** Speed multiplier from endless scaling. */
  speedMult: number;
  /** Bounty multiplier (endless: tougher capped waves pay more). */
  bountyMult: number;
  shieldTimer: number;
  attackCd: number;
  engaged: Squad | null;
  berserk: boolean;
  wave: number;
  // Status effects (timers in seconds; 0 = inactive)
  slowT: number;
  slowMult: number;
  stunT: number;
  markT: number;
  markMult: number;
  markBounty: number;
  suppressT: number;
  suppressMult: number;
  burnT: number;
  burnDps: number;
  burnSource: Squad | null;
}

export interface Projectile {
  active: boolean;
  owner: Squad | null;
  kind: 'shell' | 'rocket';
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  t: number;
  dur: number;
  damage: number;
  radius: number;
  damageType: DamageType;
  /** Stun applied by this projectile (breach charges), 0 = none. */
  stun: number;
  /** Apply the owner's on-hit statuses and modifiers. */
  useOwnerStats: boolean;
}
