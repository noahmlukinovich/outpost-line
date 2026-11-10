/**
 * A simple scripted "bot commander" for balance testing. It follows a build order, buying the
 * next item whenever it can afford it. Run `npm run balance` to see how a mission plays out.
 */
import { Balance } from '../data/balance';
import type { MissionDef } from '../data/types';
import type { Placeable, Squad } from './entities';
import { World } from './World';
import { getSpec } from '../data/specs';

export type BuildStep =
  | { place: string; x: number; y: number; tag: string }
  | { upgrade: string }
  | { spec: string; tag: string }
  | { ability: string; tag: string };

export interface AutoplayResult {
  state: string;
  stars: number;
  integrity: number;
  wavesStarted: number;
  log: string[];
}

export function autoplay(mission: MissionDef, order: BuildStep[], seed = 1, callEarly = false): AutoplayResult {
  const w = new World(mission, seed);
  const tags = new Map<string, Placeable>();
  const log: string[] = [];
  let i = 0;
  w.events.waveCleared = (idx, bonus) =>
    log.push(`wave ${idx + 1} cleared  +${bonus}  integrity ${w.integrity}/${w.maxIntegrity}  supplies ${Math.floor(w.supplies)}  power ${w.power}  t=${w.time.toFixed(0)}s`);

  const tryBuild = () => {
    while (i < order.length) {
      const step = order[i];
      if ('place' in step) {
        const p = w.place(step.place, step.x, step.y);
        if (!p) {
          const reason = w.checkPlacement(step.place, step.x, step.y).reason;
          if (reason === 'Not enough supplies') return;
          log.push(`!! could not place ${step.tag}: ${reason}`);
        } else tags.set(step.tag, p);
      } else if ('upgrade' in step) {
        const p = tags.get(step.upgrade);
        const c = p && w.checkUpgrade(p);
        if (c && !c.ok) {
          if (c.reason.startsWith('Not enough')) return;
          log.push(`!! upgrade ${step.upgrade}: ${c.reason}`);
        } else if (p && c) w.upgrade(p);
      } else {
        const s = tags.get(step.tag) as Squad | undefined;
        if (!s || s.kind !== 'squad') {
          i++;
          continue;
        }
        if ('spec' in step) {
          if (!s.def.specs.includes(step.spec)) log.push(`!! ${step.tag} has no spec ${step.spec}`);
          else if (!w.specialize(s, step.spec)) {
            const c = w.checkSpecialize(s, getSpec(step.spec));
            if (c.reason.startsWith('Not enough') || c.reason.startsWith('Needs') || c.reason.startsWith('Reach')) return;
            log.push(`!! spec ${step.spec} on ${step.tag}: ${c.reason}`);
          }
        } else if (!w.buyAbility(s, step.ability)) {
          const a = s.spec?.abilities.find((q) => q.id === step.ability);
          if (a && w.checkAbility(s, a).reason.startsWith('Not enough')) return;
          if (a && w.checkAbility(s, a).reason.startsWith('Needs')) return;
          log.push(`!! ability ${step.ability} on ${step.tag}: ${a ? w.checkAbility(s, a).reason : 'unknown'}`);
        }
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
  if (i < order.length) {
    const st = order[i];
    const tg = 'tag' in st ? tags.get(st.tag) : undefined;
    log.push(`stuck at step ${i}: ${JSON.stringify(st)} (tier ${tg?.tier}, supplies ${Math.floor(w.supplies)}, tech ${w.tech})`);
  }
  log.push(`RESULT: ${w.state} with ${w.stars}★, integrity ${w.integrity}/${w.maxIntegrity}, built ${i}/${order.length} steps`);
  return { state: w.state, stars: w.stars, integrity: w.integrity, wavesStarted: w.wavesStarted, log };
}

/** A sensible build for mission 1: economy early, specializations mid-game. */
export const GoodOrder01: BuildStep[] = [
  { place: 'rifle', x: 405, y: 420, tag: 'bunker' },
  { place: 'heavy', x: 830, y: 470, tag: 'ruins' },
  { place: 'rifle', x: 1000, y: 380, tag: 'east' },
  { place: 'reactor', x: 330, y: 560, tag: 'reactor' },
  { place: 'depot', x: 120, y: 240, tag: 'depot' },
  { upgrade: 'ruins' },
  { upgrade: 'bunker' },
  { place: 'heavy', x: 400, y: 110, tag: 'north' },
  { upgrade: 'ruins' },
  { spec: 'rocket', tag: 'ruins' },
  { upgrade: 'depot' },
  { upgrade: 'north' },
  { upgrade: 'bunker' },
  { spec: 'assault', tag: 'bunker' },
  { place: 'sniper', x: 820, y: 700, tag: 'trench' },
  { ability: 'tandem', tag: 'ruins' },
  { upgrade: 'north' },
  { spec: 'gatling', tag: 'north' },
  { place: 'engineer', x: 760, y: 420, tag: 'medic' },
  { ability: 'incinerator', tag: 'bunker' },
  { upgrade: 'trench' },
  { upgrade: 'trench' },
  { spec: 'antimateriel', tag: 'trench' },
  { ability: 'spinup', tag: 'north' },
  { upgrade: 'reactor' },
  { upgrade: 'reactor' },
  { upgrade: 'east' },
  { upgrade: 'east' },
  { spec: 'marksman', tag: 'east' },
  { ability: 'salvo', tag: 'ruins' },
  { ability: 'shieldbreaker', tag: 'trench' },
  { upgrade: 'medic' },
  { upgrade: 'medic' },
  { spec: 'medic', tag: 'medic' },
];

/** Good positions, but stops investing a third of the way in. Should take damage or lose. */
export const MediumOrder01: BuildStep[] = GoodOrder01.slice(0, 10);

/** A lazy build: rifles only, no cover, never upgrades. Should lose. */
export const LazyOrder01: BuildStep[] = [
  { place: 'rifle', x: 700, y: 480, tag: 'a' },
  { place: 'rifle', x: 900, y: 660, tag: 'b' },
  { place: 'rifle', x: 340, y: 520, tag: 'c' },
  { place: 'rifle', x: 150, y: 400, tag: 'd' },
];
