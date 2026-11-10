import { describe, expect, it } from 'vitest';
import { Endless } from '../data/endless';
import { endlessScale, generateWave } from './director';

describe('endless director', () => {
  it('is deterministic for a seed and grows over time', () => {
    expect(generateWave(7, 42)).toEqual(generateWave(7, 42));
    const count = (i: number) => generateWave(i, 1).groups.reduce((a, g) => a + g.count, 0);
    expect(count(9)).toBeGreaterThan(count(0));
  });

  it('caps the head-count and scales toughness late', () => {
    for (let i = 0; i < 60; i++) {
      const w = generateWave(i, 3);
      const n = w.groups.reduce((a, g) => a + g.count, 0);
      expect(n).toBeLessThanOrEqual(Endless.maxEnemiesPerWave + 6);
    }
    expect(endlessScale(0).hp).toBe(1);
    expect(endlessScale(30).hp).toBeGreaterThan(2);
  });

  it('every 5th wave is a surge', () => {
    expect(generateWave(4, 1).surge).toBe(true);
    expect(generateWave(5, 1).surge).toBe(false);
  });
});
