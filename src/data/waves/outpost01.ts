/**
 * Waves for mission 1, "Firebase Ridgeline".
 *
 * Each wave is a list of groups. A group spawns `count` enemies, one every `interval` seconds,
 * starting `delay` seconds after the wave begins. Groups run in parallel.
 */
import type { WaveDef } from '../types';

export const Outpost01Waves: WaveDef[] = [
  // 1: a handful of Skitters: learn to place squads.
  { clearBonus: 20, groups: [{ enemy: 'skitter', count: 8, interval: 1.4, delay: 0 }] },
  // 2: a bigger pack.
  { clearBonus: 25, groups: [{ enemy: 'skitter', count: 14, interval: 0.9, delay: 0 }] },
  // 3: first Wardens (shields + they shoot back).
  {
    clearBonus: 30,
    groups: [
      { enemy: 'skitter', count: 10, interval: 0.9, delay: 0 },
      { enemy: 'warden', count: 3, interval: 3, delay: 6 },
    ],
  },
  // 4: swarm rush: splash damage pays off.
  {
    clearBonus: 30,
    groups: [
      { enemy: 'skitter', count: 12, interval: 0.35, delay: 0 },
      { enemy: 'skitter', count: 12, interval: 0.35, delay: 10 },
    ],
  },
  // 5: first Ironback.
  {
    clearBonus: 40,
    groups: [
      { enemy: 'skitter', count: 10, interval: 0.8, delay: 0 },
      { enemy: 'ironback', count: 1, interval: 1, delay: 8 },
    ],
  },
  // 6: Warden line.
  {
    clearBonus: 40,
    groups: [
      { enemy: 'warden', count: 6, interval: 2.2, delay: 0 },
      { enemy: 'skitter', count: 16, interval: 0.6, delay: 4 },
    ],
  },
  // 7: mixed assault.
  {
    clearBonus: 45,
    groups: [
      { enemy: 'skitter', count: 20, interval: 0.45, delay: 0 },
      { enemy: 'ironback', count: 2, interval: 6, delay: 5 },
      { enemy: 'warden', count: 4, interval: 2.5, delay: 9 },
    ],
  },
  // 8: Ironback pack escorted by Wardens.
  {
    clearBonus: 50,
    groups: [
      { enemy: 'ironback', count: 3, interval: 5, delay: 0 },
      { enemy: 'warden', count: 6, interval: 1.8, delay: 3 },
    ],
  },
  // 9: the big swarm.
  {
    clearBonus: 60,
    groups: [
      { enemy: 'skitter', count: 40, interval: 0.25, delay: 0 },
      { enemy: 'warden', count: 6, interval: 1.6, delay: 6 },
      { enemy: 'ironback', count: 2, interval: 4, delay: 12 },
    ],
  },
  // 10: final assault.
  {
    clearBonus: 0,
    groups: [
      { enemy: 'skitter', count: 30, interval: 0.3, delay: 0 },
      { enemy: 'ironback', count: 4, interval: 4, delay: 4 },
      { enemy: 'warden', count: 10, interval: 1.4, delay: 8 },
      { enemy: 'skitter', count: 30, interval: 0.25, delay: 20 },
    ],
  },
];
