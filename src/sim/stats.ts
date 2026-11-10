/**
 * Squad stats: combines tier, specialization, bought abilities and veterancy into one flat set
 * of numbers the simulation reads every tick. Recomputed only when something changes.
 */
import { Balance } from '../data/balance';
import { getSpec } from '../data/specs';
import type { DamageType, Effect, SpecDef, UnitDef, WeaponDef } from '../data/types';

export interface OnHit {
  status: 'slow' | 'mark' | 'stun' | 'suppress' | 'burn';
  strength: number;
  duration: number;
}

export interface SquadStats {
  damage: number;
  rof: number;
  range: number;
  accuracy: number;
  damageType: DamageType;
  splash: number;
  projectileSpeed: number;
  projectile: 'shell' | 'rocket' | null;
  /** Extra armor pierce added to the damage type's pierce. */
  pierceBonus: number;
  hp: number;
  blockCap: number;
  arcDeg: number;
  shieldMult: number;
  armoredMult: number;
  /** The squad's own damage reduction (stacks with cover). */
  armor: number;
  firstShot: number;
  spinUp: { maxBonus: number; seconds: number } | null;
  coverBonus: { range: number; rof: number } | null;
  pierceTargets: { count: number; dmgMult: number } | null;
  multishot: { count: number; dmgMult: number } | null;
  onHit: OnHit[];
  flame: Extract<Effect, { kind: 'flame' }> | null;
  grenade: Extract<Effect, { kind: 'grenade' }> | null;
  aura: { radius: number; heal: number; rof: number; reinforce: number } | null;
  revive: { radius: number; cooldown: number } | null;
  turretCount: number;
  turretWeapon: WeaponDef | null;
  turretDamage: number;
  turretRange: number;
  markBounty: number;
  antiAir: boolean;
  detect: number;
}

export interface StatsSource {
  def: UnitDef;
  tier: number;
  spec: SpecDef | null;
  abilities: string[];
  rank: number;
}

export function computeStats(src: StatsSource): SquadStats {
  const { def, tier, spec } = src;
  const tierDef = def.tiers[tier];
  const w: WeaponDef = spec ? spec.weapon : tierDef.weapon;
  const st: SquadStats = {
    damage: w.damage,
    rof: w.rof,
    range: w.range,
    accuracy: w.accuracy,
    damageType: w.damageType,
    splash: w.splashRadius ?? 0,
    projectileSpeed: w.projectileSpeed ?? 300,
    projectile: w.splashRadius ? (w.projectile ?? 'shell') : null,
    pierceBonus: 0,
    hp: spec?.trooperHp ?? tierDef.trooperHp,
    blockCap: spec?.blockCap ?? def.blockCap,
    arcDeg: spec?.arcDeg ?? def.arcDeg,
    shieldMult: 1,
    armoredMult: 1,
    armor: 0,
    firstShot: 1,
    spinUp: null,
    coverBonus: null,
    pierceTargets: null,
    multishot: null,
    onHit: [],
    flame: null,
    grenade: null,
    aura: null,
    revive: null,
    turretCount: 0,
    turretWeapon: null,
    turretDamage: 1,
    turretRange: 1,
    markBounty: 0,
    antiAir: false,
    detect: 0,
  };

  const effects: Effect[] = [...(def.effects ?? []), ...(spec?.effects ?? [])];
  if (spec) {
    for (const a of spec.abilities) if (src.abilities.includes(a.id)) effects.push(...a.effects);
  }
  for (const e of effects) applyEffect(st, e);

  const r = src.rank;
  st.damage *= 1 + Balance.veterancyBonus.damage * r;
  st.rof *= 1 + Balance.veterancyBonus.rof * r;
  st.hp *= 1 + Balance.veterancyBonus.hp * r;
  return st;
}

function applyEffect(st: SquadStats, e: Effect): void {
  switch (e.kind) {
    case 'stat': {
      const m = e.mult ?? 1, a = e.add ?? 0;
      switch (e.stat) {
        case 'damage': st.damage = st.damage * m + a; break;
        case 'rof': st.rof = st.rof * m + a; break;
        case 'range': st.range = st.range * m + a; break;
        case 'accuracy': st.accuracy = Math.min(1, st.accuracy * m + a); break;
        case 'splash': st.splash = st.splash * m + a; break;
        case 'hp': st.hp = st.hp * m + a; break;
        case 'blockCap': st.blockCap = Math.round(st.blockCap * m + a); break;
        case 'pierce': st.pierceBonus += a; break;
      }
      break;
    }
    case 'onHit': {
      const prev = st.onHit.find((o) => o.status === e.status);
      if (prev) {
        prev.strength = Math.max(prev.strength, e.strength);
        prev.duration = Math.max(prev.duration, e.duration);
      } else st.onHit.push({ status: e.status, strength: e.strength, duration: e.duration });
      break;
    }
    case 'shieldMult': st.shieldMult *= e.mult; break;
    case 'armoredMult': st.armoredMult *= e.mult; break;
    case 'pierceTargets':
      st.pierceTargets = { count: (st.pierceTargets?.count ?? 0) + e.count, dmgMult: Math.max(st.pierceTargets?.dmgMult ?? 0, e.dmgMult) };
      break;
    case 'multishot': st.multishot = { count: e.count, dmgMult: e.dmgMult }; break;
    case 'firstShot': st.firstShot = Math.max(st.firstShot, e.mult); break;
    case 'spinUp': st.spinUp = { maxBonus: e.maxBonus, seconds: e.seconds }; break;
    case 'coverBonus': st.coverBonus = { range: e.range, rof: e.rof }; break;
    case 'armor': st.armor = 1 - (1 - st.armor) * (1 - e.reduction); break;
    case 'flame': st.flame = e; break;
    case 'grenade': st.grenade = e; break;
    case 'aura': {
      const a = (st.aura ??= { radius: 0, heal: 0, rof: 1, reinforce: 1 });
      a.radius = Math.max(a.radius, e.radius);
      a.heal += e.heal ?? 0;
      a.rof = Math.max(a.rof, e.rof ?? 1);
      a.reinforce = Math.max(a.reinforce, e.reinforce ?? 1);
      break;
    }
    case 'revive': st.revive = { radius: e.radius, cooldown: e.cooldown }; break;
    case 'turrets':
      st.turretCount += e.count;
      if (e.weapon) st.turretWeapon = e.weapon;
      break;
    case 'turretStat':
      st.turretDamage *= e.damage ?? 1;
      st.turretRange *= e.range ?? 1;
      break;
    case 'markBounty': st.markBounty = Math.max(st.markBounty, e.bonus); break;
    case 'antiAir': st.antiAir = true; break;
    case 'detect': st.detect = Math.max(st.detect, e.radius); break;
  }
}

/** Spec ids → defs for a unit (used by the UI). */
export function specsOf(def: UnitDef): [SpecDef, SpecDef] {
  return [getSpec(def.specs[0]), getSpec(def.specs[1])];
}
