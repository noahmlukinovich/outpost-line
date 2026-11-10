/**
 * Endless wave director: turns a wave number into a WaveDef, deterministically from the run's
 * seed (so the same seed gives the same run, handy for testing).
 */
import { Endless } from '../data/endless';
import type { WaveDef, WaveGroup } from '../data/types';
import { Rng } from './Rng';

export interface GeneratedWave extends WaveDef {
  theme: string;
  surge: boolean;
  /** Extra HP multiplier when the enemy count was capped. */
  hpMult: number;
}

export function generateWave(index: number, seed: number): GeneratedWave {
  const n = index + 1;
  const rng = new Rng((seed * 7919 + n * 104729) >>> 0);
  const surge = n % Endless.surgeEvery === 0;
  let budget = Endless.budget.base + Endless.budget.perWave * n + Endless.budget.quad * n * n;
  if (surge) budget *= Endless.surgeMult;

  // Pick a theme; early waves are always swarms.
  const theme = n <= 2 ? Endless.themes[0] : Endless.themes[Math.floor(rng.next() * Endless.themes.length)];
  const allowed = Object.entries(theme.mix).filter(([id]) => n >= (Endless.unlockWave[id] ?? 1));
  const share = allowed.reduce((a, [, s]) => a + s, 0);

  // Cap the head-count; fold the excess budget into toughness instead.
  let rawCount = 0;
  for (const [id, sh] of allowed) rawCount += (budget * (sh / share)) / (Endless.cost[id] ?? 1);
  const hpMult = Math.max(1, rawCount / Endless.maxEnemiesPerWave);
  budget /= hpMult;

  const groups: WaveGroup[] = [];
  let delay = 0;
  for (const [id, s] of allowed) {
    const cost = Endless.cost[id] ?? 1;
    let count = Math.max(1, Math.round((budget * (s / share)) / cost));
    // Split big groups into 1–3 pulses so pressure comes in waves within the wave.
    const pulses = Math.min(3, Math.max(1, Math.round(count / (id === 'skitter' ? 14 : id === 'warden' ? 5 : 2))));
    for (let p = 0; p < pulses && count > 0; p++) {
      const c = p === pulses - 1 ? count : Math.round(count / (pulses - p));
      count -= c;
      const interval = id === 'skitter' ? 0.3 + rng.next() * 0.4 : id === 'warden' ? 1.4 + rng.next() * 0.8 : 3 + rng.next() * 2;
      groups.push({ enemy: id, count: c, interval, delay: delay + p * (6 + rng.next() * 4) });
    }
    delay += 2 + rng.next() * 4;
  }
  return {
    groups,
    clearBonus: Math.round(Endless.clearBonus.base + Endless.clearBonus.perWave * n),
    theme: surge ? `SURGE: ${theme.name}` : theme.name,
    surge,
    hpMult,
  };
}

/** Enemy toughness multipliers for wave index (0-based). */
export function endlessScale(index: number): { hp: number; speed: number } {
  const over = Math.max(0, index + 1 - Endless.scaleFrom);
  return {
    hp: 1 + over * Endless.hpPerWave,
    speed: 1 + Math.min(Endless.maxSpeedBonus, over * Endless.speedPerWave),
  };
}
