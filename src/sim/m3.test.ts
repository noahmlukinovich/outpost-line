import { describe, expect, it } from 'vitest';
import { Balance } from '../data/balance';
import { Missions, getMission } from '../data/missions';
import type { WaveDef } from '../data/types';
import { World } from './World';

const run = (w: World, s: number) => { for (let i = 0; i < s * Balance.tickRate && !w.isOver; i++) w.step(); };
const withWaves = (id: string, waves: WaveDef[]) => ({ ...getMission(id), waves, startingSupplies: 9000 });

describe('every map', () => {
  for (const m of Missions) {
    it(`${m.id}: every cover point is a legal placement spot`, () => {
      const w = new World({ ...m, startingSupplies: 99999, commandCap: 99 });
      for (const c of w.map.cover) {
        const check = w.checkPlacement('rifle', c.x, c.y);
        expect(check.ok, `cover ${c.type} at ${c.x},${c.y}: ${check.reason}`).toBe(true);
      }
    });
  }
});

describe('M3 enemies', () => {
  it('cloaked Veilstalkers are untouchable until a Sensor Pylon reveals them', () => {
    const waves = [{ clearBonus: 0, groups: [{ enemy: 'veilstalker', count: 1, interval: 1, delay: 0, path: 'path_a' }] }];
    const hits = (withSensor: boolean) => {
      const w = new World(withWaves('outpost02', waves));
      expect(w.placeSquad('rifle', 1220, 230)).toBeTruthy();
      if (withSensor) expect(w.placeBuilding('sensor', 1250, 330)).toBeTruthy();
      let n = 0;
      w.events.enemyDamaged = () => n++;
      w.callWave();
      run(w, 12);
      return n;
    };
    expect(hits(false)).toBe(0);
    expect(hits(true)).toBeGreaterThan(0);
  });

  it('grenades cannot hit fliers but rifles can', () => {
    const waves = [{ clearBonus: 0, groups: [{ enemy: 'skyray', count: 3, interval: 1, delay: 0 }] }];
    const g = new World(withWaves('outpost02', waves));
    const h = g.placeSquad('heavy', 880, 330, 0)!;
    g.callWave();
    run(g, 40);
    expect(h.kills).toBe(0);
    const r = new World(withWaves('outpost02', waves));
    const rifle = r.placeSquad('rifle', 880, 330, 0)!;
    r.callWave();
    run(r, 40);
    expect(rifle.kills).toBeGreaterThan(0);
  });

  it('a Brood Barge unloads troops at the drop point', () => {
    const waves = [{ clearBonus: 0, groups: [{ enemy: 'broodbarge', count: 1, interval: 1, delay: 0 }] }];
    const w = new World(withWaves('outpost02', waves));
    let unloaded = false;
    w.events.bargeUnload = () => (unloaded = true);
    w.callWave();
    run(w, 60);
    expect(unloaded).toBe(true);
  });

  it('Tenders heal nearby aliens', () => {
    const waves = [{ clearBonus: 0, groups: [{ enemy: 'warden', count: 1, interval: 1, delay: 0, path: 'path_a' }, { enemy: 'tender', count: 1, interval: 1, delay: 0.2, path: 'path_a' }] }];
    const w = new World(withWaves('outpost02', waves));
    w.callWave();
    run(w, 3);
    const warden = w.enemies.find((e) => e.def.id === 'warden')!;
    warden.hp = 10;
    run(w, 2);
    expect(warden.hp).toBeGreaterThan(20);
  });

  it('the Colossus sheds armor and calls reinforcements as it weakens', () => {
    const waves = [{ clearBonus: 0, groups: [{ enemy: 'colossus', count: 1, interval: 1, delay: 0, path: 'path_a' }] }];
    const w = new World(withWaves('outpost02', waves));
    const phases: number[] = [];
    w.events.bossPhase = (_e, p) => phases.push(p);
    w.callWave();
    run(w, 2);
    const boss = w.enemies[0];
    const before = w.enemies.length;
    boss.hp = boss.maxHp * 0.6;
    // The next hit triggers phase 1.
    (w as unknown as { damageEnemy: (...a: unknown[]) => void }).damageEnemy(boss, 1, 'ap', null, null);
    expect(phases[0]).toBe(1);
    expect(boss.armorMod).toBeGreaterThan(0);
    expect(w.enemies.length).toBeGreaterThan(before);
  });
});
