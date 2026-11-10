/** Missions: which map, which waves, starting resources and available units. */
import type { MissionDef } from './types';
import { Outpost01Waves } from './waves/outpost01';
import outpost01Map from '../maps/outpost01.tmj?raw';

export const Missions: MissionDef[] = [
  {
    id: 'outpost01',
    name: 'Firebase Ridgeline',
    briefing: 'Choir scouts are probing the ridge road. Hold the gate for ten waves.',
    mapJson: outpost01Map,
    waves: Outpost01Waves,
    startingSupplies: 320,
    integrity: 20,
    commandCap: 8,
    units: ['rifle', 'heavy', 'sniper', 'engineer'],
    buildings: ['depot', 'reactor'],
  },
];

export function getMission(id: string): MissionDef {
  const m = Missions.find((q) => q.id === id);
  if (!m) throw new Error(`Unknown mission "${id}"`);
  return m;
}
