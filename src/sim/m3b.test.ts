import { describe, expect, it } from 'vitest';
import { Balance } from '../data/balance';
import { getMission } from '../data/missions';
import { Powers } from '../data/powers';
import type { WaveDef } from '../data/types';
import { World } from './World';

const run = (w: World, s: number) => { for (let i = 0; i < s * Balance.tickRate && !w.isOver; i++) w.step(); };
const mission = (waves: WaveDef[] = []) => ({ ...getMission('outpost02'), waves: waves.length ? waves : getMission('outpost02').waves, startingSupplies: 9000 });

describe('Motor Pool', () => {
  it('needs Tech 2, ignores cover, specializes into a Siege Tank at Tech 3', () => {
    const w = new World(mission());
    expect(w.checkPlacement('motorpool', 1000, 330).reason).toMatch(/Tech 2/);
    const r = w.placeBuilding('reactor', 150, 300)!;
    const car = w.placeSquad('motorpool', 980, 560)!; // a ruins cover point
    expect(car).toBeTruthy();
    expect(car.cover).toBeNull();
    expect(w.capUsed).toBe(2);
    w.upgrade(car);
    expect(w.checkUpgrade(car)!.reason).toMatch(/Tech 3/);
    w.upgrade(r);
    w.upgrade(r);
    expect(w.upgrade(car)).toBe(true);
    expect(w.specialize(car, 'siege')).toBe(true);
    expect(car.stats.splash).toBeGreaterThan(50);
  });
});

describe('commander powers', () => {
  const waves = [{ clearBonus: 0, groups: [{ enemy: 'warden', count: 4, interval: 0.3, delay: 0, path: 'path_a' }] }];

  it('Orbital Strike wipes a group after its delay and goes on cooldown', () => {
    const w = new World(mission(waves));
    w.callWave();
    run(w, Powers.orbital.initialCooldown + 4);
    const e = w.enemies[0];
    expect(w.usePower('orbital', e.x, e.y)).toBe(true);
    expect(w.usePower('orbital', e.x, e.y)).toBe(false);
    const before = w.kills;
    run(w, Powers.orbital.delay + 0.2);
    expect(w.kills).toBeGreaterThan(before);
  });

  it('EMP strips shields and stuns', () => {
    const w = new World(mission(waves));
    w.callWave();
    run(w, Powers.emp.initialCooldown + 2);
    const e = w.enemies[0];
    expect(e.shield).toBeGreaterThan(0);
    w.usePower('emp', e.x, e.y);
    run(w, Powers.emp.delay + 0.1);
    expect(e.shield).toBe(0);
    expect(e.stunT).toBeGreaterThan(0);
  });

  it('Drop Pods land a temporary squad that ignores Command Cap and leaves', () => {
    const w = new World({ ...mission(waves), commandCap: 0 });
    w.callWave();
    run(w, Powers.droppod.initialCooldown + 0.1);
    expect(w.usePower('droppod', 700, 330)).toBe(true);
    run(w, Powers.droppod.delay + 0.2);
    expect(w.squads.length).toBe(1);
    expect(w.squads[0].tier).toBe(1);
    expect(w.capUsed).toBe(0);
    run(w, (Powers.droppod.duration ?? 30) + 1);
    expect(w.squads.length).toBe(0);
  });

  it('Airstrike bombs along a line', () => {
    const w = new World(mission([{ clearBonus: 0, groups: [{ enemy: 'skitter', count: 12, interval: 0.2, delay: 0, path: 'path_a' }] }]));
    w.callWave();
    run(w, Powers.airstrike.initialCooldown + 2);
    const a = w.enemies[0], b = w.enemies[w.enemies.length - 1];
    let bombs = 0;
    w.events.bomb = () => bombs++;
    expect(w.usePower('airstrike', b.x, b.y, a.x, a.y)).toBe(true);
    const before = w.kills;
    run(w, Powers.airstrike.delay + 1);
    expect(bombs).toBe(Powers.airstrike.bombs);
    expect(w.kills).toBeGreaterThan(before);
  });
});
