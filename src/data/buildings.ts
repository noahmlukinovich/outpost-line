/**
 * Base buildings. They use no Command Cap and enemies ignore them (for now).
 *  - Supply Depot: pays `income` supplies at the start of every wave.
 *  - Reactor: provides Power. Total Power sets your Tech level (see Balance.techPower).
 *  - Sensor Pylon: reveals cloaked enemies within its detection radius.
 */
import type { BuildingDef } from './types';

export const Buildings = {
  depot: {
    id: 'depot',
    name: 'Supply Depot',
    role: 'Pays supplies every wave.',
    footprint: 28,
    art: 'bld.depot',
    tiers: [
      { cost: 90, income: 28, blurb: '+28 supplies each wave.' },
      { cost: 90, income: 50, blurb: '+50 supplies each wave.' },
      { cost: 120, income: 78, blurb: '+78 supplies each wave.' },
    ],
  },
  reactor: {
    id: 'reactor',
    name: 'Reactor',
    role: 'Power unlocks Tech 2 and 3.',
    footprint: 28,
    art: 'bld.reactor',
    tiers: [
      { cost: 75, power: 6, blurb: '6 Power (Tech 2 at 6).' },
      { cost: 80, power: 10, blurb: '10 Power.' },
      { cost: 110, power: 15, blurb: '15 Power (Tech 3 at 15).' },
    ],
  },
  sensor: {
    id: 'sensor',
    name: 'Sensor Pylon',
    role: 'Reveals cloaked enemies nearby.',
    footprint: 18,
    art: 'bld.sensor',
    tiers: [
      { cost: 70, detect: 170, blurb: 'Reveals cloaked enemies within 170.' },
      { cost: 50, detect: 220, blurb: 'Detection radius 220.' },
      { cost: 70, detect: 280, blurb: 'Detection radius 280.' },
    ],
  },
} satisfies Record<string, BuildingDef>;

export function getBuilding(id: string): BuildingDef {
  const def = (Buildings as Record<string, BuildingDef>)[id];
  if (!def) throw new Error(`Unknown building "${id}"`);
  return def;
}

export function isBuildingId(id: string): boolean {
  return id in Buildings;
}
