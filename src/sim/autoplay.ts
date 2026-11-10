/**
 * A simple scripted "bot commander" for balance testing. It follows a build order, buying the
 * next item whenever it can afford it. Run `npm run balance` to see how a mission plays out.
 */
import { Balance } from '../data/balance';
import type { MissionDef } from '../data/types';
import type { Squad } from './entities';
import { World } from './World';

export type BuildStep =
  | { place: string; x: number; y: number; tag: string }
  | { upgrade: string };

export interface AutoplayResult {
  state: string;
  stars: number;
  integrity: number;
  wavesStarted: number;
  log: string[];
}

export function autoplay(mission: MissionDef, order: BuildStep[], seed = 1, callEarly = false): AutoplayResult {
  const w = new World(mission, seed);
  const tags = new Map<string, Squad>();
  const log: string[] = [];
  let i = 0;
  w.events.waveCleared = (idx, bonus) =>
    log.push(`wave ${idx + 1} cleared  +${bonus}  integrity ${w.integrity}/${w.maxIntegrity}  supplies ${Math.floor(w.supplies)}  t=${w.time.toFixed(0)}s`);

  const tryBuild = () => {
    while (i < order.length) {
      const step = order[i];
      if ('place' in step) {
        if (!w.placeSquad(step.place, step.x, step.y)) {
          if (w.checkPlacement(step.place, step.x, step.y).reason === 'Not enough supplies') return;
          log.push(`!! could not place ${step.tag}: ${w.checkPlacement(step.place, step.x, step.y).reason}`);
        } else tags.set(step.tag, w.squads[w.squads.length - 1]);
      } else {
        const s = tags.get(step.upgrade);
        if (s && w.upgradeCost(s) !== null && !w.upgrade(s)) return;
      }
      i++;
    }
  };

  tryBuild();
  w.callWave();
  const maxSteps = 60 * 30 * Balance.tickRate;
  for (let n = 0; n < maxSteps && !w.isOver; n++) {
    if (n % Balance.tickRate === 0) {
      tryBuild();
      if (callEarly && w.canCallWave && w.enemies.length < 3) w.callWave();
    }
    w.step();
  }
  log.push(`RESULT: ${w.state} with ${w.stars}★, integrity ${w.integrity}/${w.maxIntegrity}, built ${i}/${order.length} steps`);
  return { state: w.state, stars: w.stars, integrity: w.integrity, wavesStarted: w.wavesStarted, log };
}

/** A sensible build order for mission 1 (uses the bunker and the ruins). */
export const GoodOrder01: BuildStep[] = [
  { place: 'rifle', x: 405, y: 420, tag: 'bunkerRifle' },
  { place: 'heavy', x: 830, y: 470, tag: 'ruinsHeavy' },
  { place: 'rifle', x: 1000, y: 380, tag: 'eastRifle' },
  { upgrade: 'bunkerRifle' },
  { place: 'heavy', x: 400, y: 110, tag: 'northHeavy' },
  { upgrade: 'ruinsHeavy' },
  { place: 'rifle', x: 820, y: 700, tag: 'trenchRifle' },
  { upgrade: 'bunkerRifle' },
  { upgrade: 'eastRifle' },
  { upgrade: 'northHeavy' },
  { place: 'heavy', x: 130, y: 470, tag: 'gateHeavy' },
  { upgrade: 'ruinsHeavy' },
  { upgrade: 'northHeavy' },
  { upgrade: 'trenchRifle' },
  { upgrade: 'eastRifle' },
  { upgrade: 'gateHeavy' },
  { upgrade: 'trenchRifle' },
  { upgrade: 'gateHeavy' },
  { place: 'rifle', x: 1250, y: 320, tag: 'spawnRifle' },
  { upgrade: 'spawnRifle' },
  { upgrade: 'spawnRifle' },
];

/** A lazy build: rifles only, no cover, never upgrades. Should lose. */
export const LazyOrder01: BuildStep[] = [
  { place: 'rifle', x: 700, y: 480, tag: 'a' },
  { place: 'rifle', x: 900, y: 660, tag: 'b' },
  { place: 'rifle', x: 340, y: 520, tag: 'c' },
  { place: 'rifle', x: 150, y: 400, tag: 'd' },
];

/** Good positions, but stops investing halfway. Should survive, but take damage. */
export const MediumOrder01: BuildStep[] = GoodOrder01.slice(0, 10);
