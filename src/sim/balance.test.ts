/**
 * Balance smoke test: a sensible build should win mission 1, a lazy one should not breeze through.
 * Prints the wave-by-wave log so you can see how tuning changes play out (`npm run balance`).
 */
import { describe, expect, it } from 'vitest';
import { getMission } from '../data/missions';
import { autoplay, EndlessOrder01, GoodOrder01, LazyOrder01, MediumOrder01 } from './autoplay';

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

describe('endless balance', () => {
  it('a strong build lasts a while but eventually falls; a weak one falls early', () => {
    const endless = getMission('endless01');
    const strong = autoplay(endless, EndlessOrder01, 1, false, 240);
    const weak = autoplay(endless, MediumOrder01, 1, false, 240);
    console.log(`ENDLESS strong: fell after ${strong.wavesCleared} waves, ${strong.kills} kills (${strong.state})`);
    console.log(`ENDLESS weak:   fell after ${weak.wavesCleared} waves, ${weak.kills} kills (${weak.state})`);
    expect(strong.state).toBe('lost');
    expect(strong.wavesCleared).toBeGreaterThan(weak.wavesCleared);
    expect(weak.wavesCleared).toBeGreaterThanOrEqual(5);
  });
});
