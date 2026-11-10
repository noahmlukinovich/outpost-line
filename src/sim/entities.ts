/** Simulation entities. Plain data; the World updates them, the renderer reads them. */
import type { DamageType, EnemyDef, TargetMode, UnitDef } from '../data/types';
import type { Path } from '../maps/geometry';
import type { CoverPoint } from '../maps/loadMap';

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

export interface Squad {
  id: number;
  def: UnitDef;
  /** 0 = I, 1 = II, 2 = III */
  tier: number;
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
  cover: CoverPoint | null;
  down: boolean;
  downTimer: number;
  sinceHit: number;
  reinforceTimer: number;
  /** Number of melee enemies currently fighting this squad. */
  engagedBy: number;
  crewCooldown: number;
  target: Enemy | null;
  kills: number;
  removed: boolean;
}

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
  shieldTimer: number;
  attackCd: number;
  engaged: Squad | null;
  berserk: boolean;
  wave: number;
}

export interface Projectile {
  active: boolean;
  owner: Squad | null;
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
}
