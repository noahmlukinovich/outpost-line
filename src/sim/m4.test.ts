import { describe, expect, it } from 'vitest';
import { Balance } from '../data/balance';
import { getMission } from '../data/missions';
import { computeMods } from './mods';
import { World } from './World';

const run = (w: World, s: number) => { for (let i = 0; i < s * Balance.tickRate && !w.isOver; i++) w.step(); };
const m1 = getMission('outpost01');

describe('heroes', () => {
  it('spawn free near the gate, move anywhere, cannot be sold', () => {
    const w = new World(m1, 1, { hero: 'kastellan' });
    const h = w.hero!;
    expect(h).toBeTruthy();
    expect(w.capUsed).toBe(0);
    expect(w.supplies).toBe(m1.startingSupplies);
    const r = w.setRally(h, 1000, 590); // on the road, far away
    expect(r).toEqual({ x: 1000, y: 590 });
    expect(w.sell(h)).toBe(0);
    expect(w.checkUpgrade(h)).toBeNull();
  });

  it('level up from kills and unlock the second ability at level 3', () => {
    const w = new World({ ...m1, startingSupplies: 5000 }, 1, { hero: 'kastellan' });
    expect(w.checkHeroAbility(1)).toMatch(/level 3/);
    w.setRally(w.hero!, 405, 420);
    w.placeSquad('heavy', 830, 470);
    w.placeSquad('rifle', 1000, 380);
    w.callWave();
    for (let k = 0; k < 6 && w.hero!.hero!.level < 3; k++) {
      run(w, 40);
      if (w.canCallWave) w.callWave();
    }
    expect(w.hero!.hero!.level).toBeGreaterThanOrEqual(3);
    expect(w.checkHeroAbility(1)).toBe('');
  });

  it('Rally Cry buffs nearby squads; Shield Wall raises armor', () => {
    const w = new World({ ...m1, startingSupplies: 5000 }, 1, { hero: 'kastellan' });
    const h = w.hero!;
    const s = w.placeSquad('rifle', 130, 470)!;
    h.x = 160;
    h.y = 520;
    expect(w.useHeroAbility(0)).toBe(true);
    expect(s.buffRof).toBeGreaterThan(1);
    expect(w.useHeroAbility(0)).toBe(false); // cooling down
    const b = new World(m1, 1, { hero: 'okonjo' });
    const before = b.hero!.stats.armor;
    b.useHeroAbility(0);
    expect(b.hero!.stats.armor).toBeGreaterThan(before);
  });

  it('Venn lays mines that blow up under enemies', () => {
    const w = new World(m1, 1, { hero: 'venn', mods: computeMods(['her1', 'her2', 'her3']) });
    expect(w.hero!.hero!.level).toBe(3);
    w.callWave();
    expect(w.useHeroAbility(1)).toBe(true);
    expect(w.mines.length).toBe(3);
    // Take Venn out of the fight so the Skitters reach the mines.
    w.hero!.down = true;
    w.hero!.downTimer = 999;
    run(w, 60);
    expect(w.mines.length).toBeLessThan(3);
  });
});

describe('tech tree', () => {
  it('applies economy, cost and power modifiers', () => {
    const mods = computeMods(['eco1', 'eco2', 'eco3', 'eco4', 'inf1', 'inf2', 'cmd1']);
    const w = new World(m1, 1, { mods });
    expect(w.supplies).toBe(m1.startingSupplies + 50);
    expect(w.capMax).toBe(m1.commandCap + 1);
    expect(w.checkPlacement('rifle', 405, 420).ok).toBe(true);
    w.placeSquad('rifle', 405, 420);
    expect(w.supplies).toBe(m1.startingSupplies + 50 - Math.round(70 * 0.85));
    expect(w.powerDefs.orbital.cooldown).toBeCloseTo(70 * 0.85);
    const plain = new World(m1);
    const a = w.squads[0].stats.damage, b = plain.placeSquad('rifle', 405, 420)!.stats.damage;
    expect(a).toBeCloseTo(b * 1.12);
  });
});
