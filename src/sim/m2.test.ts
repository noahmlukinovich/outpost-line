import { describe, expect, it } from 'vitest';
import { Balance } from '../data/balance';
import { getMission } from '../data/missions';
import { getSpec } from '../data/specs';
import { World } from './World';

const mission = { ...getMission('outpost01'), startingSupplies: 5000 };
const run = (w: World, s: number) => { for (let i = 0; i < s * Balance.tickRate && !w.isOver; i++) w.step(); };

describe('M2: tech, cap, economy', () => {
  it('tier III and specializations need Tech 2 from a Reactor', () => {
    const w = new World(mission);
    const s = w.placeSquad('rifle', 405, 420)!;
    expect(w.upgrade(s)).toBe(true);
    expect(w.checkUpgrade(s)!.reason).toMatch(/Tech 2/);
    w.placeBuilding('reactor', 330, 560);
    expect(w.tech).toBe(2);
    expect(w.upgrade(s)).toBe(true);
    expect(w.specialize(s, 'assault')).toBe(true);
    expect(w.specialize(s, 'marksman')).toBe(false);
    expect(s.stats.blockCap).toBe(4);
    // Tech 3 ability is locked until Power 15.
    expect(w.buyAbility(s, 'holdline')).toBe(false);
    expect(w.buyAbility(s, 'breach')).toBe(true);
    expect(s.stats.grenade).not.toBeNull();
  });

  it('enforces Command Cap', () => {
    const w = new World({ ...mission, commandCap: 1 });
    expect(w.placeSquad('rifle', 405, 420)).toBeTruthy();
    expect(w.checkPlacement('rifle', 830, 470).reason).toMatch(/Command Cap/);
    expect(w.placeBuilding('depot', 120, 240)).toBeTruthy(); // buildings are free of cap
  });

  it('depots pay at the start of each later wave', () => {
    const w = new World(mission);
    w.placeBuilding('depot', 120, 240);
    w.callWave();
    const before = w.supplies;
    w.callWave(); // not callable during spawning
    run(w, 60);
    expect(w.wavesStarted).toBeGreaterThanOrEqual(2);
    expect(w.supplies).toBeGreaterThan(before);
  });

  it('squads gain veterancy from kills', () => {
    const w = new World(mission);
    const s = w.placeSquad('heavy', 830, 470)!;
    w.placeSquad('rifle', 405, 420);
    w.callWave();
    run(w, 120);
    expect(s.xp).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
  });

  it('turret crew deploys turrets', () => {
    const w = new World(mission);
    w.placeBuilding('reactor', 330, 560);
    const s = w.placeSquad('engineer', 760, 420)!;
    w.upgrade(s); w.upgrade(s);
    expect(w.checkSpecialize(s, getSpec('turrets')).ok).toBe(true);
    w.specialize(s, 'turrets');
    expect(s.turrets.length).toBe(2);
    w.buyAbility(s, 'thirdturret');
    expect(s.turrets.length).toBe(3);
  });
});
