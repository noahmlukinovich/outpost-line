/** Missions: which map, which waves, starting resources and available units. */
import type { MissionDef } from './types';
import { Outpost01Waves } from './waves/outpost01';
import { Outpost02Waves } from './waves/outpost02';
import outpost02Map from '../maps/outpost02.tmj?raw';
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
  {
    id: 'outpost02',
    name: 'Dustline Junction',
    briefing: 'Two roads, one gate, and the Choir has learned to fly. Hold twelve waves.',
    mapJson: outpost02Map,
    waves: Outpost02Waves,
    startingSupplies: 460,
    integrity: 20,
    commandCap: 9,
    units: ['rifle', 'heavy', 'sniper', 'engineer', 'motorpool'],
    buildings: ['depot', 'reactor', 'sensor'],
  },
  {
    id: 'endless01',
    name: 'Endless: Firebase Ridgeline',
    briefing: 'No relief is coming. Hold as long as you can.',
    mapJson: outpost01Map,
    waves: [],
    startingSupplies: 360,
    integrity: 20,
    commandCap: 10,
    units: ['rifle', 'heavy', 'sniper', 'engineer', 'motorpool'],
    buildings: ['depot', 'reactor', 'sensor'],
    endless: true,
  },
];

export function getMission(id: string): MissionDef {
  const m = Missions.find((q) => q.id === id);
  if (!m) throw new Error(`Unknown mission "${id}"`);
  return m;
}
