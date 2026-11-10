/**
 * Waves for mission 2, "Dustline Junction": two roads (path_a north, path_b south) that merge,
 * plus a flight route. Groups without `path` alternate between the roads at random.
 */
import type { WaveDef } from '../types';

export const Outpost02Waves: WaveDef[] = [
  // 1: both roads at once: split your defense or hold the junction.
  { clearBonus: 40, groups: [
    { enemy: 'skitter', count: 8, interval: 1.1, delay: 0, path: 'path_a' },
    { enemy: 'skitter', count: 8, interval: 1.1, delay: 3, path: 'path_b' },
  ] },
  // 2: first Tenders keep Wardens alive.
  { clearBonus: 45, groups: [
    { enemy: 'warden', count: 4, interval: 2.5, delay: 0, path: 'path_a' },
    { enemy: 'tender', count: 1, interval: 1, delay: 4, path: 'path_a' },
    { enemy: 'skitter', count: 12, interval: 0.7, delay: 2, path: 'path_b' },
  ] },
  // 3: Veilstalkers: build a Sensor Pylon.
  { clearBonus: 50, groups: [
    { enemy: 'skitter', count: 14, interval: 0.6, delay: 0 },
    { enemy: 'veilstalker', count: 2, interval: 3, delay: 6, path: 'path_b' },
  ] },
  // 4: first fliers.
  { clearBonus: 50, groups: [
    { enemy: 'skyray', count: 4, interval: 1.8, delay: 0 },
    { enemy: 'skitter', count: 16, interval: 0.5, delay: 4, path: 'path_a' },
  ] },
  // 5: armored push down both roads.
  { clearBonus: 55, groups: [
    { enemy: 'ironback', count: 1, interval: 1, delay: 0, path: 'path_a' },
    { enemy: 'warden', count: 4, interval: 2, delay: 6 },
    { enemy: 'tender', count: 1, interval: 4, delay: 8 },
    { enemy: 'skitter', count: 12, interval: 0.5, delay: 4, path: 'path_b' },
  ] },
  // 6: dropship.
  { clearBonus: 60, groups: [
    { enemy: 'broodbarge', count: 1, interval: 1, delay: 0 },
    { enemy: 'skitter', count: 20, interval: 0.45, delay: 2 },
  ] },
  // 7: stalker hunt with escorts, and a second armored push.
  { clearBonus: 60, groups: [
    { enemy: 'ironback', count: 1, interval: 1, delay: 12, path: 'path_b' },
    { enemy: 'veilstalker', count: 5, interval: 2, delay: 0 },
    { enemy: 'warden', count: 5, interval: 1.8, delay: 4, path: 'path_a' },
    { enemy: 'skyray', count: 6, interval: 1.2, delay: 8 },
  ] },
  // 8: air raid.
  { clearBonus: 65, groups: [
    { enemy: 'skyray', count: 12, interval: 0.9, delay: 0 },
    { enemy: 'broodbarge', count: 2, interval: 8, delay: 4 },
  ] },
  // 9: everything.
  { clearBonus: 70, groups: [
    { enemy: 'skitter', count: 30, interval: 0.3, delay: 0 },
    { enemy: 'ironback', count: 3, interval: 4, delay: 5 },
    { enemy: 'tender', count: 3, interval: 3, delay: 8 },
    { enemy: 'veilstalker', count: 4, interval: 2.5, delay: 10 },
  ] },
  // 10: double dropship + wardens.
  { clearBonus: 75, groups: [
    { enemy: 'broodbarge', count: 2, interval: 5, delay: 0 },
    { enemy: 'warden', count: 8, interval: 1.4, delay: 3 },
    { enemy: 'skyray', count: 8, interval: 1, delay: 8 },
  ] },
  // 11: the calm before.
  { clearBonus: 75, groups: [
    { enemy: 'ironback', count: 4, interval: 4, delay: 0 },
    { enemy: 'tender', count: 3, interval: 4, delay: 3 },
    { enemy: 'skitter', count: 24, interval: 0.35, delay: 6 },
  ] },
  // 12: BOSS: the Colossus Strider, with escorts.
  { clearBonus: 0, groups: [
    { enemy: 'colossus', count: 1, interval: 1, delay: 0, path: 'path_a' },
    { enemy: 'warden', count: 6, interval: 2, delay: 6 },
    { enemy: 'skyray', count: 8, interval: 1.2, delay: 12 },
    { enemy: 'veilstalker', count: 3, interval: 3, delay: 16 },
    { enemy: 'skitter', count: 30, interval: 0.4, delay: 20 },
  ] },
];
