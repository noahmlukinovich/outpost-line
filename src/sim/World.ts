/**
 * The game simulation: all rules, no graphics.
 *
 * Call `step()` a fixed number of times per second (Balance.tickRate). The UI changes the game
 * only through the command methods (placeSquad, upgrade, sell, rotate, setRally, callWave…),
 * which validate everything in one place.
 */
import { Balance } from '../data/balance';
import { getCover } from '../data/cover';
import { getEnemy } from '../data/enemies';
import type { MissionDef, TargetMode, UnitDef, WaveGroup } from '../data/types';
import { getUnit } from '../data/units';
import { angleDiff, type Path, type Vec } from '../maps/geometry';
import { isTerrainBuildable, loadTiledMap, type CoverPoint, type MapModel } from '../maps/loadMap';
import type { Enemy, Projectile, Squad, Trooper } from './entities';
import type { SimEvents } from './events';
import { Rng } from './Rng';
import { SpatialHash } from './SpatialHash';

export type GameState = 'prep' | 'running' | 'won' | 'lost';

export interface PlacementCheck {
  ok: boolean;
  x: number;
  y: number;
  cover: CoverPoint | null;
  reason: string;
}

interface ActiveGroup {
  group: WaveGroup;
  wave: number;
  path: Path;
  spawned: number;
  timer: number;
}

const TARGET_MODES: TargetMode[] = ['first', 'strongest', 'weakest', 'closest'];

export class World {
  readonly dt = 1 / Balance.tickRate;
  readonly map: MapModel;
  readonly mission: MissionDef;
  readonly rng: Rng;
  events: SimEvents = {};

  state: GameState = 'prep';
  time = 0;
  supplies: number;
  integrity: number;
  readonly maxIntegrity: number;

  /** Number of waves that have started (so the current wave number, 1-based). */
  wavesStarted = 0;
  /** Seconds until the next wave auto-starts; -1 while not counting down. */
  countdown = -1;
  countdownTotal = Balance.waveCountdown;

  readonly squads: Squad[] = [];
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];

  private nextId = 1;
  private readonly enemyPool: Enemy[] = [];
  private readonly shellPool: Projectile[] = [];
  private readonly groups: ActiveGroup[] = [];
  private readonly waveAlive: number[];
  private readonly waveSpawnDone: boolean[];
  private readonly waveCleared: boolean[];
  private readonly coverOccupant = new Map<number, Squad>();
  private readonly hash: SpatialHash<Enemy>;
  private readonly near: Enemy[] = [];
  private readonly tmp: Vec = { x: 0, y: 0 };

  constructor(mission: MissionDef, seed = 1) {
    this.mission = mission;
    this.map = loadTiledMap(mission.mapJson);
    this.rng = new Rng(seed);
    this.supplies = mission.startingSupplies;
    this.integrity = this.maxIntegrity = mission.integrity;
    this.hash = new SpatialHash(this.map.width, this.map.height, 64);
    const n = mission.waves.length;
    this.waveAlive = new Array(n).fill(0);
    this.waveSpawnDone = new Array(n).fill(false);
    this.waveCleared = new Array(n).fill(false);
    // Validate data cross-references early, with readable errors.
    for (const w of mission.waves) for (const g of w.groups) {
      getEnemy(g.enemy);
      if (g.path && !this.map.paths.some((p) => p.name === g.path)) throw new Error(`Wave references unknown path "${g.path}"`);
    }
    for (const u of mission.units) getUnit(u);
  }

  get totalWaves(): number {
    return this.mission.waves.length;
  }

  get stars(): number {
    if (this.state !== 'won') return 0;
    const f = this.integrity / this.maxIntegrity;
    return 1 + (f >= Balance.starThresholds[0] ? 1 : 0) + (f >= Balance.starThresholds[1] ? 1 : 0);
  }

  // ================================================================== commands

  checkPlacement(unitId: string, x: number, y: number): PlacementCheck {
    const def = getUnit(unitId);
    const res: PlacementCheck = { ok: false, x, y, cover: null, reason: '' };
    // Snap onto a free cover point if close enough.
    let best: number = Balance.coverSnapDistance;
    for (const c of this.map.cover) {
      if (this.coverOccupant.has(c.index)) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < best) {
        best = d;
        res.cover = c;
        res.x = c.x;
        res.y = c.y;
      }
    }
    if (!isTerrainBuildable(this.map, res.x, res.y, def.footprint * 0.6)) {
      res.reason = 'Blocked terrain';
      return res;
    }
    for (const p of this.map.paths) {
      const clear = p.width / 2 + def.footprint + Balance.pathClearance;
      if (p.distSqTo(res.x, res.y) < clear * clear) {
        res.reason = 'Too close to the road';
        return res;
      }
    }
    for (const s of this.squads) {
      const min = s.def.footprint + def.footprint;
      if (Math.hypot(s.anchorX - res.x, s.anchorY - res.y) < min || Math.hypot(s.x - res.x, s.y - res.y) < min) {
        res.reason = 'Overlaps another squad';
        return res;
      }
    }
    if (this.supplies < def.tiers[0].cost) {
      res.reason = 'Not enough supplies';
      return res;
    }
    if (this.state === 'won' || this.state === 'lost') {
      res.reason = 'Mission over';
      return res;
    }
    res.ok = true;
    return res;
  }

  /** Facing that points the squad at the nearest stretch of road. */
  suggestFacing(x: number, y: number): number {
    let best = Infinity;
    let fx = x + 1, fy = y;
    for (const p of this.map.paths) {
      p.closestPoint(x, y, this.tmp);
      const d = (this.tmp.x - x) ** 2 + (this.tmp.y - y) ** 2;
      if (d < best) {
        best = d;
        fx = this.tmp.x;
        fy = this.tmp.y;
      }
    }
    return Math.atan2(fy - y, fx - x);
  }

  placeSquad(unitId: string, x: number, y: number, facing?: number): Squad | null {
    const check = this.checkPlacement(unitId, x, y);
    if (!check.ok) return null;
    const def = getUnit(unitId);
    const cost = def.tiers[0].cost;
    this.supplies -= cost;
    const f = facing ?? this.suggestFacing(check.x, check.y);
    const squad: Squad = {
      id: this.nextId++,
      def,
      tier: 0,
      invested: cost,
      placedAtWave: this.wavesStarted,
      anchorX: check.x,
      anchorY: check.y,
      rallyX: check.x,
      rallyY: check.y,
      x: check.x,
      y: check.y,
      facing: f,
      targetMode: 'first',
      troopers: [],
      cover: null,
      down: false,
      downTimer: 0,
      sinceHit: 99,
      reinforceTimer: 0,
      engagedBy: 0,
      crewCooldown: 0.5,
      target: null,
      kills: 0,
      removed: false,
    };
    for (let i = 0; i < def.troopers; i++) {
      const t: Trooper = { alive: true, hp: def.tiers[0].trooperHp, x: 0, y: 0, prevX: 0, prevY: 0, angle: f, cooldown: this.rng.range(0, 0.6) };
      squad.troopers.push(t);
    }
    this.layoutTroopers(squad, true);
    this.updateCover(squad);
    this.squads.push(squad);
    this.events.squadPlaced?.(squad);
    return squad;
  }

  upgradeCost(squad: Squad): number | null {
    return squad.tier >= 2 ? null : squad.def.tiers[squad.tier + 1].cost;
  }

  upgrade(squad: Squad): boolean {
    const cost = this.upgradeCost(squad);
    if (cost === null || this.supplies < cost || squad.removed || this.isOver) return false;
    this.supplies -= cost;
    squad.invested += cost;
    const oldHp = squad.def.tiers[squad.tier].trooperHp;
    squad.tier++;
    const gain = squad.def.tiers[squad.tier].trooperHp - oldHp;
    for (const t of squad.troopers) if (t.alive) t.hp += gain;
    this.events.squadUpgraded?.(squad);
    return true;
  }

  sellValue(squad: Squad): number {
    const full = Balance.fullRefundBeforeNextWave && squad.placedAtWave === this.wavesStarted;
    return Math.floor(squad.invested * (full ? 1 : Balance.sellRefund));
  }

  sell(squad: Squad): number {
    if (squad.removed || this.isOver) return 0;
    const refund = this.sellValue(squad);
    this.supplies += refund;
    squad.removed = true;
    this.releaseEngaged(squad);
    if (squad.cover) this.coverOccupant.delete(squad.cover.index);
    this.squads.splice(this.squads.indexOf(squad), 1);
    this.events.squadRemoved?.(squad, refund);
    return refund;
  }

  rotate(squad: Squad, facing: number): void {
    squad.facing = Math.atan2(Math.sin(facing), Math.cos(facing));
  }

  /** Moves the rally point, clamped to the leash circle and to legal terrain. Returns the final point. */
  setRally(squad: Squad, x: number, y: number): Vec {
    let dx = x - squad.anchorX, dy = y - squad.anchorY;
    const d = Math.hypot(dx, dy);
    if (d > squad.def.leash) {
      dx *= squad.def.leash / d;
      dy *= squad.def.leash / d;
    }
    let rx = squad.anchorX + dx, ry = squad.anchorY + dy;
    // Snap to a nearby free cover point (or the one we're already in).
    for (const c of this.map.cover) {
      const occ = this.coverOccupant.get(c.index);
      if (occ && occ !== squad) continue;
      if (Math.hypot(c.x - rx, c.y - ry) < Balance.coverSnapDistance * 0.8 && Math.hypot(c.x - squad.anchorX, c.y - squad.anchorY) <= squad.def.leash) {
        rx = c.x;
        ry = c.y;
        break;
      }
    }
    if (isTerrainBuildable(this.map, rx, ry, 8)) {
      squad.rallyX = rx;
      squad.rallyY = ry;
    }
    return { x: squad.rallyX, y: squad.rallyY };
  }

  cycleTargetMode(squad: Squad): TargetMode {
    squad.targetMode = TARGET_MODES[(TARGET_MODES.indexOf(squad.targetMode) + 1) % TARGET_MODES.length];
    return squad.targetMode;
  }

  /** Bonus you'd get for calling the next wave right now (0 before the first wave). */
  get callEarlyBonus(): number {
    if (this.countdown <= 0 || this.wavesStarted === 0) return 0;
    return Math.floor(Balance.callEarlyMaxBonus * (this.countdown / this.countdownTotal));
  }

  get canCallWave(): boolean {
    return (this.state === 'prep' || (this.state === 'running' && this.countdown > 0)) && this.wavesStarted < this.totalWaves;
  }

  callWave(): boolean {
    if (!this.canCallWave) return false;
    const bonus = this.callEarlyBonus;
    this.supplies += bonus;
    this.startWave(bonus);
    return true;
  }

  get isOver(): boolean {
    return this.state === 'won' || this.state === 'lost';
  }

  /** Effective weapon range for a squad (tier + cover bonus). */
  rangeOf(squad: Squad): number {
    const w = squad.def.tiers[squad.tier].weapon;
    return w.range * (squad.cover ? getCover(squad.cover.type).rangeBonus : 1);
  }

  coverOccupiedBy(c: CoverPoint): Squad | undefined {
    return this.coverOccupant.get(c.index);
  }

  // ================================================================== simulation

  step(): void {
    if (this.isOver) return;
    const dt = this.dt;
    this.time += dt;

    this.updateWaves(dt);

    this.hash.clear();
    for (const e of this.enemies) this.hash.insert(e);

    for (const s of this.squads) this.updateSquad(s, dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) this.updateEnemy(this.enemies[i], dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.updateShell(this.projectiles[i], i, dt);

    // Remove dead/leaked enemies (swap-remove keeps it O(1)).
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        const last = this.enemies.pop()!;
        if (i < this.enemies.length) this.enemies[i] = last;
        this.enemyPool.push(e);
      }
    }

    this.checkWaveClears();
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.state = 'lost';
      this.events.gameOver?.(false);
    } else if (
      this.wavesStarted === this.totalWaves &&
      this.waveSpawnDone.every(Boolean) &&
      this.enemies.length === 0
    ) {
      this.state = 'won';
      this.events.gameOver?.(true);
    }
  }

  // ---------------------------------------------------------------- waves

  private startWave(earlyBonus: number): void {
    const index = this.wavesStarted++;
    const wave = this.mission.waves[index];
    this.state = 'running';
    this.countdown = -1;
    for (const g of wave.groups) {
      const path = g.path ? this.map.paths.find((p) => p.name === g.path)! : this.map.paths[0];
      this.groups.push({ group: g, wave: index, path, spawned: 0, timer: g.delay });
    }
    if (wave.groups.length === 0) this.waveSpawnDone[index] = true;
    this.events.waveStarted?.(index, earlyBonus);
  }

  private updateWaves(dt: number): void {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      g.timer -= dt;
      while (g.timer <= 0 && g.spawned < g.group.count) {
        this.spawnEnemy(g.group.enemy, g.path, g.wave);
        g.spawned++;
        g.timer += g.group.interval;
      }
      if (g.spawned >= g.group.count) {
        this.groups.splice(i, 1);
        if (!this.groups.some((o) => o.wave === g.wave)) this.waveSpawnDone[g.wave] = true;
      }
    }
    // Start the countdown to the next wave once the current wave has finished spawning.
    const cur = this.wavesStarted - 1;
    if (this.state === 'running' && this.countdown < 0 && cur >= 0 && this.waveSpawnDone[cur] && this.wavesStarted < this.totalWaves) {
      this.countdown = this.countdownTotal = Balance.waveCountdown;
    }
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = -1;
        this.startWave(0);
      }
    }
  }

  private checkWaveClears(): void {
    for (let i = 0; i < this.wavesStarted; i++) {
      if (!this.waveCleared[i] && this.waveSpawnDone[i] && this.waveAlive[i] === 0) {
        this.waveCleared[i] = true;
        const bonus = this.mission.waves[i].clearBonus;
        this.supplies += bonus;
        this.events.waveCleared?.(i, bonus);
      }
    }
  }

  private spawnEnemy(id: string, path: Path, wave: number): void {
    const def = getEnemy(id);
    const e: Enemy = this.enemyPool.pop() ?? ({} as Enemy);
    e.id = this.nextId++;
    e.def = def;
    e.alive = true;
    e.path = path;
    e.dist = 0;
    e.lane = this.rng.range(-0.32, 0.32) * path.width;
    e.heading = path.sample(0, this.tmp);
    e.x = e.prevX = this.tmp.x;
    e.y = e.prevY = this.tmp.y;
    e.hp = e.maxHp = def.hp;
    e.shield = def.shield;
    e.shieldTimer = 0;
    e.attackCd = this.rng.range(0.2, 1);
    e.engaged = null;
    e.berserk = false;
    e.wave = wave;
    this.enemies.push(e);
    this.waveAlive[wave]++;
    this.events.enemySpawned?.(e);
  }

  // ---------------------------------------------------------------- squads

  /** Trooper formation: a shallow arc facing `squad.facing`, centered on the squad position. */
  private slot(squad: Squad, i: number, out: Vec): Vec {
    const n = squad.troopers.length;
    const spacing = n > 2 ? 13 : 15;
    const lateral = (i - (n - 1) / 2) * spacing;
    const forward = -Math.abs(lateral) * 0.35 + (squad.def.crewServed && i === 0 ? 4 : 0);
    const c = Math.cos(squad.facing), s = Math.sin(squad.facing);
    out.x = squad.x + forward * c - lateral * s;
    out.y = squad.y + forward * s + lateral * c;
    return out;
  }

  private layoutTroopers(squad: Squad, snap: boolean): void {
    for (let i = 0; i < squad.troopers.length; i++) {
      const t = squad.troopers[i];
      this.slot(squad, i, this.tmp);
      if (snap) {
        t.x = t.prevX = this.tmp.x;
        t.y = t.prevY = this.tmp.y;
      }
    }
  }

  private updateCover(squad: Squad): void {
    const current = squad.cover;
    if (current && Math.hypot(current.x - squad.x, current.y - squad.y) <= getCover(current.type).radius) return;
    if (current) {
      this.coverOccupant.delete(current.index);
      squad.cover = null;
    }
    for (const c of this.map.cover) {
      if (this.coverOccupant.has(c.index)) continue;
      if (Math.hypot(c.x - squad.x, c.y - squad.y) <= getCover(c.type).radius) {
        squad.cover = c;
        this.coverOccupant.set(c.index, squad);
        return;
      }
    }
  }

  private updateSquad(s: Squad, dt: number): void {
    for (const t of s.troopers) {
      t.prevX = t.x;
      t.prevY = t.y;
    }
    if (s.down) {
      s.downTimer -= dt;
      if (s.downTimer <= 0) {
        s.down = false;
        s.sinceHit = 99;
        const hp = s.def.tiers[s.tier].trooperHp;
        for (const t of s.troopers) {
          t.alive = true;
          t.hp = hp;
        }
        s.x = s.rallyX;
        s.y = s.rallyY;
        this.layoutTroopers(s, true);
        this.updateCover(s);
        this.events.squadRestored?.(s);
      }
      return;
    }

    // Walk toward the rally point.
    const dx = s.rallyX - s.x, dy = s.rallyY - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      const stepLen = Math.min(dist, Balance.squadMoveSpeed * dt);
      s.x += (dx / dist) * stepLen;
      s.y += (dy / dist) * stepLen;
      if (s.engagedBy > 0 && dist > 20) this.releaseEngaged(s);
      this.updateCover(s);
    }

    // Troopers walk to their formation slots.
    const tstep = Balance.squadMoveSpeed * 1.5 * dt;
    for (let i = 0; i < s.troopers.length; i++) {
      const t = s.troopers[i];
      this.slot(s, i, this.tmp);
      const tx = this.tmp.x - t.x, ty = this.tmp.y - t.y;
      const td = Math.hypot(tx, ty);
      if (td > tstep) {
        t.x += (tx / td) * tstep;
        t.y += (ty / td) * tstep;
      } else {
        t.x = this.tmp.x;
        t.y = this.tmp.y;
      }
    }

    // Healing and reinforcements while out of combat.
    s.sinceHit += dt;
    if (s.sinceHit >= Balance.reinforceDelay) {
      const maxHp = s.def.tiers[s.tier].trooperHp;
      let missing: Trooper | null = null;
      for (const t of s.troopers) {
        if (t.alive) t.hp = Math.min(maxHp, t.hp + maxHp * 0.15 * dt);
        else if (!missing) missing = t;
      }
      if (missing) {
        s.reinforceTimer += dt;
        if (s.reinforceTimer >= Balance.reinforceTime) {
          s.reinforceTimer = 0;
          missing.alive = true;
          missing.hp = maxHp;
          missing.x = missing.prevX = s.x;
          missing.y = missing.prevY = s.y;
          this.events.trooperRestored?.(s, missing);
        }
      }
    }

    // Targeting.
    const weapon = s.def.tiers[s.tier].weapon;
    const range = this.rangeOf(s);
    s.target = this.pickTarget(s, range);

    // Aim.
    for (const t of s.troopers) {
      if (!t.alive) continue;
      const want = s.target ? Math.atan2(s.target.y - t.y, s.target.x - t.x) : s.facing;
      const diff = angleDiff(want, t.angle);
      const maxTurn = 7 * dt;
      t.angle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
    }

    if (!s.target) return;
    const target = s.target;

    if (s.def.crewServed) {
      s.crewCooldown -= dt;
      if (s.crewCooldown > 0) return;
      let alive = 0;
      let gunner: Trooper | null = null;
      for (const t of s.troopers) if (t.alive) {
        alive++;
        gunner ??= t;
      }
      if (!gunner) return;
      if (Math.abs(angleDiff(Math.atan2(target.y - gunner.y, target.x - gunner.x), gunner.angle)) > 0.25) return;
      const crewFactor = Math.pow(alive / s.troopers.length, Balance.crewPenaltyExponent);
      s.crewCooldown = 1 / (weapon.rof * crewFactor);
      this.fireShell(s, gunner, target);
    } else {
      for (const t of s.troopers) {
        if (!t.alive) continue;
        t.cooldown -= dt;
        if (t.cooldown > 0) continue;
        if (Math.abs(angleDiff(Math.atan2(target.y - t.y, target.x - t.x), t.angle)) > 0.3) continue;
        t.cooldown = (1 / weapon.rof) * this.rng.range(0.85, 1.15);
        const hit = this.rng.chance(weapon.accuracy);
        let tx = target.x, ty = target.y;
        if (!hit) {
          tx += this.rng.range(-22, 22);
          ty += this.rng.range(-22, 22);
        }
        this.events.shot?.(s, t, tx, ty, hit);
        if (hit) this.damageEnemy(target, weapon.damage, weapon.damageType, s);
        if (!target.alive) break;
      }
    }
  }

  private pickTarget(s: Squad, range: number): Enemy | null {
    const half = (s.def.arcDeg * Math.PI) / 360;
    const candidates = this.hash.query(s.x, s.y, range + 20, this.near);
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      if (!e.alive) continue;
      const dx = e.x - s.x, dy = e.y - s.y;
      const dSq = dx * dx + dy * dy;
      const reach = range + e.def.radius;
      if (dSq > reach * reach) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), s.facing)) > half) continue;
      let score: number;
      switch (s.targetMode) {
        case 'first': score = e.dist; break;
        case 'strongest': score = e.hp + e.shield; break;
        case 'weakest': score = -(e.hp + e.shield); break;
        case 'closest': score = -dSq; break;
      }
      // Melee enemies already fighting this squad get priority (self-defense).
      if (e.engaged === s) score += 1e6;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private fireShell(s: Squad, gunner: Trooper, target: Enemy): void {
    const w = s.def.tiers[s.tier].weapon;
    const p: Projectile = this.shellPool.pop() ?? ({} as Projectile);
    const speed = w.projectileSpeed ?? 300;
    const muzzleX = gunner.x + Math.cos(gunner.angle) * 12;
    const muzzleY = gunner.y + Math.sin(gunner.angle) * 12;
    // Lead the target: aim where it will be when the shell lands.
    let flight = Math.hypot(target.x - muzzleX, target.y - muzzleY) / speed;
    let tx = target.x, ty = target.y;
    if (!target.engaged) {
      const spd = target.def.speed * (target.berserk ? Balance.berserkSpeed : 1);
      tx += Math.cos(target.heading) * spd * flight;
      ty += Math.sin(target.heading) * spd * flight;
      flight = Math.hypot(tx - muzzleX, ty - muzzleY) / speed;
    }
    p.active = true;
    p.owner = s;
    p.x0 = p.x = p.prevX = muzzleX;
    p.y0 = p.y = p.prevY = muzzleY;
    p.tx = tx;
    p.ty = ty;
    p.t = 0;
    p.dur = Math.max(0.12, flight);
    p.damage = w.damage;
    p.radius = w.splashRadius ?? 30;
    p.damageType = w.damageType;
    this.projectiles.push(p);
    this.events.shellFired?.(s, gunner, p);
  }

  private updateShell(p: Projectile, index: number, dt: number): void {
    p.prevX = p.x;
    p.prevY = p.y;
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.x0 + (p.tx - p.x0) * k;
    p.y = p.y0 + (p.ty - p.y0) * k;
    if (k < 1) return;
    // Detonate.
    const near = this.hash.query(p.tx, p.ty, p.radius + 20, this.near);
    for (const e of near) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.tx, e.y - p.ty) - e.def.radius * 0.5;
      if (d > p.radius) continue;
      const falloff = 1 - (1 - Balance.splashEdgeFactor) * Math.max(0, d / p.radius);
      this.damageEnemy(e, p.damage * falloff, p.damageType, p.owner);
    }
    this.events.explosion?.(p.tx, p.ty, p.radius);
    p.active = false;
    p.owner = null;
    const last = this.projectiles.pop()!;
    if (index < this.projectiles.length) this.projectiles[index] = last;
    this.shellPool.push(p);
  }

  private damageSquad(s: Squad, amount: number): Trooper | null {
    if (s.down || s.removed) return null;
    const reduction = s.cover ? getCover(s.cover.type).damageReduction : 0;
    const dmg = amount * (1 - reduction);
    // Hit a random living trooper.
    let count = 0;
    for (const t of s.troopers) if (t.alive) count++;
    if (count === 0) return null;
    let pick = Math.floor(this.rng.next() * count);
    let victim: Trooper | null = null;
    for (const t of s.troopers) if (t.alive && pick-- === 0) victim = t;
    if (!victim) return null;
    s.sinceHit = 0;
    s.reinforceTimer = 0;
    victim.hp -= dmg;
    if (victim.hp <= 0) {
      victim.alive = false;
      victim.hp = 0;
      this.events.trooperLost?.(s, victim);
      if (count === 1) {
        s.down = true;
        s.downTimer = Balance.downTime;
        s.target = null;
        this.releaseEngaged(s);
        this.events.squadDown?.(s);
      }
    }
    return victim;
  }

  private releaseEngaged(s: Squad): void {
    for (const e of this.enemies) if (e.engaged === s) e.engaged = null;
    s.engagedBy = 0;
  }

  // ---------------------------------------------------------------- enemies

  private damageEnemy(e: Enemy, amount: number, type: keyof typeof Balance.pierce, source: Squad | null): void {
    if (!e.alive) return;
    let remaining = amount;
    let shieldHit = false;
    e.shieldTimer = 0;
    if (e.shield > 0) {
      shieldHit = true;
      const mult = Balance.shieldMultiplier[type];
      const shieldDmg = amount * mult;
      if (shieldDmg >= e.shield) {
        remaining = (shieldDmg - e.shield) / mult;
        e.shield = 0;
        this.events.shieldBroken?.(e);
      } else {
        e.shield -= shieldDmg;
        remaining = 0;
      }
    }
    const dealt = remaining * (1 - e.def.armor * (1 - Balance.pierce[type]));
    e.hp -= dealt;
    this.events.enemyDamaged?.(e, shieldHit ? amount : dealt, shieldHit && remaining === 0);
    if (e.hp <= 0) {
      e.alive = false;
      this.waveAlive[e.wave]--;
      if (e.engaged) {
        e.engaged.engagedBy = Math.max(0, e.engaged.engagedBy - 1);
        e.engaged = null;
      }
      this.supplies += e.def.bounty;
      if (source && !source.removed) source.kills++;
      this.events.enemyKilled?.(e, e.def.bounty);
    } else if (!e.berserk && e.def.berserkAt > 0 && e.hp / e.maxHp < e.def.berserkAt) {
      e.berserk = true;
      this.events.enemyBerserk?.(e);
    }
  }

  private updateEnemy(e: Enemy, dt: number): void {
    if (!e.alive) return;
    e.prevX = e.x;
    e.prevY = e.y;
    const def = e.def;

    if (def.shield > 0 && e.shield < def.shield) {
      e.shieldTimer += dt;
      if (e.shieldTimer >= def.shieldDelay) e.shield = Math.min(def.shield, e.shield + def.shieldRegen * dt);
    }

    const dmgMult = e.berserk ? Balance.berserkDamage : 1;
    e.attackCd -= dt;

    if (def.attack.kind === 'melee') {
      // Drop the fight if the squad left, went down or was sold.
      const s = e.engaged;
      if (s && (s.down || s.removed || Math.hypot(s.x - e.x, s.y - e.y) > def.attack.range + 30)) {
        s.engagedBy = Math.max(0, s.engagedBy - 1);
        e.engaged = null;
      }
      if (!e.engaged) {
        for (const q of this.squads) {
          if (q.down || q.engagedBy >= q.def.blockCap) continue;
          if (Math.hypot(q.x - e.x, q.y - e.y) <= def.attack.range + q.def.footprint * 0.5) {
            e.engaged = q;
            q.engagedBy++;
            break;
          }
        }
      }
      if (e.engaged) {
        const q = e.engaged;
        e.heading = Math.atan2(q.y - e.y, q.x - e.x);
        if (e.attackCd <= 0) {
          e.attackCd = 1 / def.attack.rate;
          const victim = this.damageSquad(q, def.attack.damage * dmgMult);
          if (victim) this.events.enemyMelee?.(e, q, victim);
        }
        return; // held in place
      }
    } else if (e.attackCd <= 0) {
      let best: Squad | null = null;
      let bestD = def.attack.range;
      for (const q of this.squads) {
        if (q.down) continue;
        const d = Math.hypot(q.x - e.x, q.y - e.y);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
      if (best) {
        e.attackCd = 1 / def.attack.rate;
        const victim = this.damageSquad(best, def.attack.damage * dmgMult);
        if (victim) this.events.enemyShot?.(e, best, victim);
      } else {
        e.attackCd = 0.2; // look again soon
      }
    }

    // Walk the path.
    e.dist += def.speed * (e.berserk ? Balance.berserkSpeed : 1) * dt;
    if (e.dist >= e.path.length) {
      e.alive = false;
      this.waveAlive[e.wave]--;
      this.integrity -= def.leak;
      this.events.enemyLeaked?.(e);
      return;
    }
    e.heading = e.path.sample(e.dist, this.tmp);
    // Lane offset perpendicular to the heading, eased in over the first few steps.
    const lane = e.lane * Math.min(1, e.dist / 40);
    e.x = this.tmp.x - Math.sin(e.heading) * lane;
    e.y = this.tmp.y + Math.cos(e.heading) * lane;
  }

  /** Every unit definition the player can build in this mission. */
  get buildable(): UnitDef[] {
    return this.mission.units.map(getUnit);
  }
}
