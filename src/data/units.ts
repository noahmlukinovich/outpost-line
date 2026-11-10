/**
 * FDC squads. Each has three tiers (I → II → III). Branching specializations arrive in M2.
 *
 * Quick guide:
 *  - cost: supplies for that tier (tier I = placement price).
 *  - weapon.damage × weapon.rof × troopers ≈ damage per second at full strength (rifles).
 *  - range is in world units; the map is 1440 × 900 units.
 */
import type { UnitDef } from './types';

export const Units = {
  rifle: {
    id: 'rifle',
    name: 'Rifle Squad',
    role: 'Cheap all-rounder. Holds the line.',
    troopers: 4,
    crewServed: false,
    arcDeg: 140,
    footprint: 24,
    leash: 110,
    blockCap: 3,
    cap: 1,
    art: 'unit.rifle',
    tiers: [
      {
        cost: 70,
        trooperHp: 30,
        blurb: 'Four marines with carbines.',
        weapon: { damage: 5, rof: 1.6, range: 150, damageType: 'ballistic', accuracy: 0.85 },
      },
      {
        cost: 60,
        trooperHp: 38,
        blurb: '+Damage, +range, tougher armor.',
        weapon: { damage: 7, rof: 1.8, range: 160, damageType: 'ballistic', accuracy: 0.88 },
      },
      {
        cost: 100,
        trooperHp: 48,
        blurb: 'Battle rifles: big damage boost.',
        weapon: { damage: 10, rof: 2.0, range: 172, damageType: 'ballistic', accuracy: 0.9 },
      },
    ],
  },

  heavy: {
    id: 'heavy',
    name: 'Heavy Weapons',
    role: 'Grenade launcher. Splash damage vs. swarms, dents armor.',
    troopers: 2,
    crewServed: true,
    arcDeg: 100,
    footprint: 24,
    leash: 80,
    blockCap: 1,
    cap: 1,
    art: 'unit.rifle',
    leadArt: 'unit.heavy',
    tiers: [
      {
        cost: 110,
        trooperHp: 34,
        blurb: 'Two-crew grenade launcher.',
        weapon: {
          damage: 16, rof: 0.55, range: 175, damageType: 'explosive', accuracy: 1,
          splashRadius: 42, projectileSpeed: 330,
        },
      },
      {
        cost: 90,
        trooperHp: 42,
        blurb: '+Damage, bigger blast.',
        weapon: {
          damage: 24, rof: 0.6, range: 185, damageType: 'explosive', accuracy: 1,
          splashRadius: 50, projectileSpeed: 350,
        },
      },
      {
        cost: 140,
        trooperHp: 52,
        blurb: 'Autoloader: faster, heavier shells.',
        weapon: {
          damage: 34, rof: 0.75, range: 195, damageType: 'explosive', accuracy: 1,
          splashRadius: 56, projectileSpeed: 380,
        },
      },
    ],
  },
} satisfies Record<string, UnitDef>;

export type UnitId = keyof typeof Units;

export function getUnit(id: string): UnitDef {
  const def = (Units as Record<string, UnitDef>)[id];
  if (!def) throw new Error(`Unknown unit id "${id}"`);
  return def;
}
