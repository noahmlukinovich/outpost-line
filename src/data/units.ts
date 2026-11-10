/**
 * FDC squads. Each has three tiers (I → II → III), then branches into one of two
 * specializations (see specs.ts).
 *
 * Quick guide:
 *  - cost: supplies for that tier (tier I = placement price).
 *  - tech: tech level required (Power from Reactors unlocks Tech 2 and 3; see balance.ts).
 *  - damage × rof × troopers ≈ damage per second at full strength (rifles; crew-served = one weapon).
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
    specs: ['assault', 'marksman'],
    tiers: [
      { cost: 70, trooperHp: 30, blurb: 'Four marines with carbines.',
        weapon: { damage: 5, rof: 1.6, range: 150, damageType: 'ballistic', accuracy: 0.85 } },
      { cost: 60, trooperHp: 38, blurb: '+Damage, +range, tougher armor.',
        weapon: { damage: 7, rof: 1.8, range: 160, damageType: 'ballistic', accuracy: 0.88 } },
      { cost: 100, trooperHp: 48, tech: 2, blurb: 'Battle rifles: big damage boost.',
        weapon: { damage: 10, rof: 2.0, range: 172, damageType: 'ballistic', accuracy: 0.9 } },
    ],
  },

  heavy: {
    id: 'heavy',
    name: 'Heavy Weapons',
    role: 'Grenade launcher. Splash vs. swarms, dents armor.',
    troopers: 2,
    crewServed: true,
    arcDeg: 100,
    footprint: 24,
    leash: 80,
    blockCap: 1,
    cap: 1,
    art: 'unit.loader',
    leadArt: 'unit.heavy',
    specs: ['rocket', 'gatling'],
    tiers: [
      { cost: 110, trooperHp: 34, blurb: 'Two-crew grenade launcher.',
        weapon: { damage: 16, rof: 0.55, range: 175, damageType: 'explosive', accuracy: 1, splashRadius: 42, projectileSpeed: 330 } },
      { cost: 90, trooperHp: 42, blurb: '+Damage, bigger blast.',
        weapon: { damage: 24, rof: 0.6, range: 185, damageType: 'explosive', accuracy: 1, splashRadius: 50, projectileSpeed: 350 } },
      { cost: 140, trooperHp: 52, tech: 2, blurb: 'Autoloader: faster, heavier shells.',
        weapon: { damage: 34, rof: 0.75, range: 195, damageType: 'explosive', accuracy: 1, splashRadius: 56, projectileSpeed: 380 } },
    ],
  },

  sniper: {
    id: 'sniper',
    name: 'Sniper Team',
    role: 'Very long range, armor-piercing. Narrow arc.',
    troopers: 2,
    crewServed: true,
    arcDeg: 70,
    footprint: 22,
    leash: 90,
    blockCap: 0,
    cap: 1,
    art: 'unit.spotter',
    leadArt: 'unit.sniper',
    specs: ['spotter', 'antimateriel'],
    tiers: [
      { cost: 120, trooperHp: 26, blurb: 'Sniper and spotter. Pierces armor.',
        weapon: { damage: 40, rof: 0.42, range: 270, damageType: 'ap', accuracy: 0.97 } },
      { cost: 100, trooperHp: 30, blurb: '+Damage, +range.',
        weapon: { damage: 58, rof: 0.45, range: 290, damageType: 'ap', accuracy: 0.98 } },
      { cost: 150, trooperHp: 36, tech: 2, blurb: 'Heavy rifle: much more damage.',
        weapon: { damage: 85, rof: 0.48, range: 310, damageType: 'ap', accuracy: 0.99 } },
    ],
  },

  engineer: {
    id: 'engineer',
    name: 'Engineers',
    role: 'Support. Heals nearby squads; light SMGs.',
    troopers: 3,
    crewServed: false,
    arcDeg: 360,
    footprint: 24,
    leash: 100,
    blockCap: 1,
    cap: 1,
    art: 'unit.engineer',
    specs: ['medic', 'turrets'],
    effects: [{ kind: 'aura', radius: 110, heal: 2.5 }],
    tiers: [
      { cost: 90, trooperHp: 28, blurb: 'Field techs: heal nearby squads.',
        weapon: { damage: 3, rof: 1.4, range: 120, damageType: 'ballistic', accuracy: 0.8 } },
      { cost: 80, trooperHp: 34, blurb: 'Better kit: tougher, hits harder.',
        weapon: { damage: 4, rof: 1.6, range: 125, damageType: 'ballistic', accuracy: 0.85 } },
      { cost: 100, trooperHp: 40, tech: 2, blurb: 'Veteran techs.',
        weapon: { damage: 5, rof: 1.8, range: 130, damageType: 'ballistic', accuracy: 0.85 } },
    ],
  },
} satisfies Record<string, UnitDef>;

export type UnitId = keyof typeof Units;

export function getUnit(id: string): UnitDef {
  const def = (Units as Record<string, UnitDef>)[id];
  if (!def) throw new Error(`Unknown unit id "${id}"`);
  return def;
}
