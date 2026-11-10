import { describe, expect, it } from 'vitest';
import { Balance } from '../data/balance';
import { getMission } from '../data/missions';
import { World } from './World';

const mission = getMission('outpost01');

function run(world: World, seconds: number) {
  const steps = Math.round(seconds * Balance.tickRate);
  for (let i = 0; i < steps && !world.isOver; i++) world.step();
}

describe('map 1 data', () => {
  it('loads and every cover point is a legal placement spot', () => {
    const w = new World({ ...mission, startingSupplies: 99999 });
    expect(w.map.paths.length).toBe(1);
    expect(w.map.cover.length).toBeGreaterThanOrEqual(6);
    for (const c of w.map.cover) {
      const check = w.checkPlacement('rifle', c.x, c.y);
      expect(check.ok, `cover ${c.type} at ${c.x},${c.y}: ${check.reason}`).toBe(true);
    }
  });
});

describe('placement', () => {
  it('rejects the road, overlaps and unaffordable squads; snaps to cover', () => {
    const w = new World(mission);
    const p = w.map.paths[0].points[3];
    expect(w.checkPlacement('rifle', p.x, p.y).reason).toBe('Too close to the road');
    const c = w.map.cover[0];
    const snap = w.checkPlacement('rifle', c.x + 20, c.y + 10);
    expect(snap.ok).toBe(true);
    expect(snap.cover).toBe(c);
    const s = w.placeSquad('rifle', c.x, c.y)!;
    expect(s).toBeTruthy();
    expect(s.cover).toBe(c);
    expect(w.supplies).toBe(mission.startingSupplies - 70);
    expect(w.checkPlacement('rifle', c.x + 10, c.y).ok).toBe(false);
  });

  it('refunds fully before the next wave, partially after', () => {
    const w = new World(mission);
    const s = w.placeSquad('rifle', 405, 420)!;
    expect(w.sellValue(s)).toBe(70);
    w.callWave();
    expect(w.sellValue(s)).toBe(Math.floor(70 * Balance.sellRefund));
  });

  it('clamps the rally point to the leash', () => {
    const w = new World(mission);
    const s = w.placeSquad('rifle', 405, 420)!;
    const r = w.setRally(s, 405 + 500, 420);
    expect(Math.hypot(r.x - s.anchorX, r.y - s.anchorY)).toBeLessThanOrEqual(s.def.leash + 0.01);
  });
});

describe('combat', () => {
  it('a squad covering the road kills skitters and earns bounty', () => {
    const w = new World(mission);
    w.placeSquad('rifle', 405, 420);
    w.placeSquad('heavy', 830, 470);
    const before = w.supplies;
    w.callWave();
    run(w, 40);
    expect(w.supplies).toBeGreaterThan(before);
    expect(w.integrity).toBe(mission.integrity);
  });

  it('with no defense, enemies leak and the mission is lost', () => {
    const w = new World(mission);
    w.callWave();
    run(w, 600);
    expect(w.state).toBe('lost');
  });

  it('is deterministic for the same seed', () => {
    const play = () => {
      const w = new World(mission, 42);
      w.placeSquad('rifle', 405, 420);
      w.callWave();
      run(w, 30);
      return [w.supplies, w.integrity, w.enemies.length];
    };
    expect(play()).toEqual(play());
  });
});
