/**
 * Global balance knobs. Tweak freely; everything reads from here.
 */
import type { DamageType } from './types';

export const Balance = {
  /** Simulation steps per second. Higher = more precise, more CPU. 30 is plenty. */
  tickRate: 30,

  /** Fraction of supplies refunded when selling. */
  sellRefund: 0.7,
  /** Full refund if sold before the next wave starts (undo a misplacement for free). */
  fullRefundBeforeNextWave: true,

  /** Seconds between the end of one wave's spawns and the next wave (wave 1 waits for you). */
  waveCountdown: 22,
  /** Max supplies for calling a wave early (scaled by how much countdown was left). */
  callEarlyMaxBonus: 40,

  /** Squads: seconds without taking damage before lost troopers start returning. */
  reinforceDelay: 4,
  /** Seconds per returning trooper. */
  reinforceTime: 3,
  /** Seconds a wiped-out squad stays Down before redeploying at full strength. */
  downTime: 12,
  /** Squad walk speed when moving to a new rally point (units/sec). */
  squadMoveSpeed: 90,
  /** Placement snaps to a cover point if dropped within this distance of it. */
  coverSnapDistance: 44,
  /** Minimum gap between a squad's footprint edge and the path's edge. */
  pathClearance: 4,

  /** Crew-served weapons fire slower when crew are missing: rof × (alive/total)^this. */
  crewPenaltyExponent: 0.7,

  /**
   * Armor pierce per damage type: 0 = fully blocked by armor, 1 = ignores armor.
   * Final damage = damage × (1 − armor × (1 − pierce)).
   */
  pierce: { ballistic: 0, explosive: 0.45, ap: 0.85, fire: 0.6, energy: 0.3 } satisfies Record<DamageType, number>,

  /** Shield damage multiplier per damage type. */
  shieldMultiplier: { ballistic: 1, explosive: 0.7, ap: 1.5, fire: 0.5, energy: 1.6 } satisfies Record<DamageType, number>,

  /** Berserk: speed and damage multipliers. */
  berserkSpeed: 1.6,
  berserkDamage: 1.5,

  /** Splash damage at the edge of the blast radius (fraction of center damage). */
  splashEdgeFactor: 0.5,

  /** Stars: integrity fraction remaining required for 2★ and 3★. */
  starThresholds: [0.5, 0.9],
} as const;
