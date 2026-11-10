/**
 * Balance smoke test: a sensible build should win mission 1, a lazy one should not breeze through.
 * Prints the wave-by-wave log so you can see how tuning changes play out (`npm run balance`).
 */
import { describe, expect, it } from 'vitest';
import { getMission } from '../data/missions';
import { autoplay, GoodOrder01, LazyOrder01, MediumOrder01 } from './autoplay';

const mission = getMission('outpost01');

describe('mission 1 balance', () => {
  it('a good build wins', () => {
    const r = autoplay(mission, GoodOrder01);
    console.log(['GOOD BUILD', ...r.log].join('\n'));
    expect(r.state).toBe('won');
  });

  it('a half-hearted build loses integrity', () => {
    const r = autoplay(mission, MediumOrder01);
    console.log(['MEDIUM BUILD', ...r.log].join('\n'));
    expect(r.stars).toBeLessThan(3);
  });

  it('a lazy build does not get 3 stars', () => {
    const r = autoplay(mission, LazyOrder01);
    console.log(['LAZY BUILD', ...r.log].join('\n'));
    expect(r.stars).toBeLessThan(3);
  });
});
