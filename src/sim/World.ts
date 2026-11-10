/**
 * The game simulation: all rules, no graphics.
 *
 * Call `step()` a fixed number of times per second (Balance.tickRate). The UI changes the game
 * only through the command methods (place, upgrade, specialize, buyAbility, sell, rotate,
 * setRally, callWave…), which validate everything in one place.
 */
import { Balance } from '../data/balance';
import { getBuilding, isBuildingId } from '../data/buildings';
import { getCover } from '../data/cover';
import { getEnemy } from '../data/enemies';
import { getSpec } from '../data/specs';
import type { AbilityDef, DamageType, MissionDef, SpecDef, TargetMode, Tech, UnitDef, WaveGroup } from '../data/types';
import { getUnit } from '../data/units';
import { angleDiff, type Path, type Vec } from '../maps/geometry';
import { isTerrainBuildable, loadTiledMap, type CoverPoint, type MapModel } from '../maps/loadMap';
import type { Building, Enemy, Placeable, Projectile, Squad, Trooper, Turret } from './entities';
import type { SimEvents } from './events';
import { Rng } from './Rng';
import { SpatialHash } from './SpatialHash';
import { computeStats, type SquadStats } from './stats';
import { endlessScale, generateWave, type GeneratedWave } from './director';
import { Endless } from '../data/endless';
import type { WaveDef } from '../data/types';

export type GameState = 'prep' | 'running' | 'won' | 'lost';

export interface PlacementCheck {
  ok: boolean;
  x: number;
  y: number;
  cover: CoverPoint | null;
  reason: string;
}

/** Why an upgrade/spec/ability can't be bought right now ('' = it can). */
export type BuyCheck = { ok: boolean; cost: number; reason: string };

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
  countdownTotal: number = Balance.waveCountdown;

  readonly squads: Squad[] = [];
  readonly buildings: Building[] = [];
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];

  private nextId = 1;
  private readonly enemyPool: Enemy[] = [];
  private readonly shellPool: Projectile[] = [];
  private readonly groups: ActiveGroup[] = [];
  private readonly waveAlive: number[] = [];
  private readonly waveSpawnDone: boolean[] = [];
  private readonly waveCleared: boolean[] = [];
  private readonly generated = new Map<number, GeneratedWave>();
  readonly seed: number;
  /** Enemies killed this mission (endless score). */
  kills = 0;
  private readonly coverOccupant = new Map<number, Squad>();
  private readonly hash: SpatialHash<Enemy>;
  private readonly near: Enemy[] = [];
  private readonly picks: Enemy[] = [];
  private readonly tmp: Vec = { x: 0, y: 0 };
  private lastTech: Tech = 1;

  constructor(mission: MissionDef, seed = 1) {
    this.mission = mission;
    this.map = loadTiledMap(mission.mapJson);
    this.rng = new Rng(seed);
    this.supplies = mission.startingSupplies;
    this.integrity = this.maxIntegrity = mission.integrity;
    this.hash = new SpatialHash(this.map.width, this.map.height, 64);
    this.seed = seed;
    // Validate data cross-references early, with readable errors.
    for (const w of mission.waves) for (const g of w.groups) {
      getEnemy(g.enemy);
      if (g.path && !this.map.paths.some((p) => p.name === g.path)) throw new Error(`Wave references unknown path "${g.path}"`);
    }
    for (const u of mission.units) for (const s of getUnit(u).specs) getSpec(s);
    for (const b of mission.buildings) getBuilding(b);
  }

  get endless(): boolean {
    return !!this.mission.endless;
  }

  get totalWaves(): number {
    return this.endless ? Infinity : this.mission.waves.length;
  }

  /** The definition of wave `index` (generated on demand in endless mode). */
  waveDef(index: number): WaveDef & { theme?: string; surge?: boolean } {
    if (!this.endless) return this.mission.waves[index];
    let w = this.generated.get(index);
    if (!w) {
      w = generateWave(index, this.seed);
      this.generated.set(index, w);
    }
    return w;
  }

  /** Waves fully cleared (endless score). */
  get wavesCleared(): number {
    return this.waveCleared.filter(Boolean).length;
  }

  get stars(): number {
    if (this.state !== 'won') return 0;
    const f = this.integrity / this.maxIntegrity;
    return 1 + (f >= Balance.starThresholds[0] ? 1 : 0) + (f >= Balance.starThresholds[1] ? 1 : 0);
  }

  get power(): number {
    let p = 0;
    for (const b of this.buildings) p += b.def.tiers[b.tier].power ?? 0;
    return p;
  }

  get tech(): Tech {
    const p = this.power;
    return p >= Balance.techPower[1] ? 3 : p >= Balance.techPower[0] ? 2 : 1;
  }

  get capUsed(): number {
    let c = 0;
    for (const s of this.squads) c += s.def.cap;
    return c;
  }

  get capMax(): number {
    return this.mission.commandCap;
  }

  get income(): number {
    let i = 0;
    for (const b of this.buildings) i += b.def.tiers[b.tier].income ?? 0;
    return i;
  }

  get isOver(): boolean {
    return this.state === 'won' || this.state === 'lost';
  }

  /** Every unit the player can build in this mission. */
  get buildableUnits(): UnitDef[] {
    return this.mission.units.map(getUnit);
  }

  // ================================================================== placement

  /** Footprint radius and first-tier cost for a unit or building id. */
  private placeInfo(id: string): { footprint: number; cost: number; isUnit: boolean } {
    if (isBuildingId(id)) {
      const b = getBuilding(id);
      return { footprint: b.footprint, cost: b.tiers[0].cost, isUnit: false };
    }
    const u = getUnit(id);
    return { footprint: u.footprint, cost: u.tiers[0].cost, isUnit: true };
  }

  checkPlacement(id: string, x: number, y: number): PlacementCheck {
    const info = this.placeInfo(id);
    const res: PlacementCheck = { ok: false, x, y, cover: null, reason: '' };
    if (info.isUnit) {
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
    }
    if (!isTerrainBuildable(this.map, res.x, res.y, info.footprint * 0.6)) {
      res.reason = 'Blocked terrain';
      return res;
    }
    for (const p of this.map.paths) {
      const clear = p.width / 2 + info.footprint + Balance.pathClearance;
      if (p.distSqTo(res.x, res.y) < clear * clear) {
        res.reason = 'Too close to the road';
        return res;
      }
    }
    if (!info.isUnit) {
      // Buildings may not sit on cover points (keep them for squads).
      for (const c of this.map.cover) {
        if (Math.hypot(c.x - res.x, c.y - res.y) < info.footprint + 18) {
          res.reason = 'Cover is for squads';
          return res;
        }
      }
    }
    for (const s of this.squads) {
      const min = s.def.footprint + info.footprint;
      if (Math.hypot(s.anchorX - res.x, s.anchorY - res.y) < min || Math.hypot(s.x - res.x, s.y - res.y) < min) {
        res.reason = 'Overlaps a squad';
        return res;
      }
    }
    for (const b of this.buildings) {
      if (Math.hypot(b.x - res.x, b.y - res.y) < b.def.footprint + info.footprint) {
        res.reason = 'Overlaps a building';
        return res;
      }
    }
    if (info.isUnit && this.capUsed + getUnit(id).cap > this.capMax) {
      res.reason = `Command Cap full (${this.capUsed}/${this.capMax})`;
      return res;
    }
    if (this.supplies < info.cost) {
      res.reason = 'Not enough supplies';
      return res;
    }
    if (this.isOver) {
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

  /** Place a unit or building. Returns the new entity, or null if not allowed. */
  place(id: string, x: number, y: number, facing?: number): Placeable | null {
    return isBuildingId(id) ? this.placeBuilding(id, x, y) : this.placeSquad(id, x, y, facing);
  }

  placeBuilding(id: string, x: number, y: number): Building | null {
    const check = this.checkPlacement(id, x, y);
    if (!check.ok) return null;
    const def = getBuilding(id);
    this.supplies -= def.tiers[0].cost;
    const b: Building = {
      kind: 'building', id: this.nextId++, def, tier: 0, invested: def.tiers[0].cost,
      placedAtWave: this.wavesStarted, x: check.x, y: check.y, removed: false,
    };
    this.buildings.push(b);
    this.events.buildingPlaced?.(b);
    this.checkTech();
    return b;
  }

  placeSquad(unitId: string, x: number, y: number, facing?: number): Squad | null {
    const check = this.checkPlacement(unitId, x, y);
    if (!check.ok) return null;
    const def = getUnit(unitId);
    const cost = def.tiers[0].cost;
    this.supplies -= cost;
    const f = facing ?? this.suggestFacing(check.x, check.y);
    const squad: Squad = {
      kind: 'squad',
      id: this.nextId++,
      def,
      tier: 0,
      spec: null,
      abilities: [],
      stats: computeStats({ def, tier: 0, spec: null, abilities: [], rank: 0 }),
      xp: 0,
      rank: 0,
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
      turrets: [],
      cover: null,
      down: false,
      downTimer: 0,
      sinceHit: 99,
      reinforceTimer: 0,
      engagedBy: 0,
      crewCooldown: 0.5,
      flameCd: 1,
      grenadeCd: 2,
      reviveCd: 0,
      spin: 0,
      lastTargetId: -1,
      target: null,
      kills: 0,
      removed: false,
      auraRof: 1,
      auraReinforce: 1,
    };
    for (let i = 0; i < def.troopers; i++) {
      const t: Trooper = { alive: true, hp: squad.stats.hp, x: 0, y: 0, prevX: 0, prevY: 0, angle: f, cooldown: this.rng.range(0, 0.6) };
      squad.troopers.push(t);
    }
    this.layoutTroopers(squad, true);
    this.updateCover(squad);
    this.squads.push(squad);
    this.events.squadPlaced?.(squad);
    return squad;
  }

  // ================================================================== upgrades

  private techCheck(cost: number, tech: Tech | undefined): BuyCheck {
    if (this.isOver) return { ok: false, cost, reason: 'Mission over' };
    if ((tech ?? 1) > this.tech) return { ok: false, cost, reason: `Needs Tech ${tech} (build Reactors)` };
    if (this.supplies < cost) return { ok: false, cost, reason: 'Not enough supplies' };
    return { ok: true, cost, reason: '' };
  }

  /** null when there is no further tier. */
  checkUpgrade(p: Placeable): BuyCheck | null {
    if (p.tier >= 2) return null;
    const next = p.def.tiers[p.tier + 1];
    return this.techCheck(next.cost, 'tech' in next ? next.tech : undefined);
  }

  upgrade(p: Placeable): boolean {
    const c = this.checkUpgrade(p);
    if (!c?.ok || p.removed) return false;
    this.supplies -= c.cost;
    p.invested += c.cost;
    p.tier++;
    if (p.kind === 'squad') {
      this.refreshStats(p);
      this.events.squadUpgraded?.(p);
    } else {
      this.events.buildingUpgraded?.(p);
      this.checkTech();
    }
    return true;
  }

  checkSpecialize(s: Squad, spec: SpecDef): BuyCheck {
    if (s.tier < 2) return { ok: false, cost: spec.cost, reason: 'Reach tier III first' };
    if (s.spec) return { ok: false, cost: spec.cost, reason: 'Already specialized' };
    return this.techCheck(spec.cost, spec.tech);
  }

  specialize(s: Squad, specId: string): boolean {
    const spec = getSpec(specId);
    if (!s.def.specs.includes(specId)) return false;
    const c = this.checkSpecialize(s, spec);
    if (!c.ok) return false;
    this.supplies -= c.cost;
    s.invested += c.cost;
    s.spec = spec;
    this.refreshStats(s);
    this.events.squadSpecialized?.(s);
    return true;
  }

  checkAbility(s: Squad, a: AbilityDef): BuyCheck {
    if (s.abilities.includes(a.id)) return { ok: false, cost: a.cost, reason: 'Owned' };
    return this.techCheck(a.cost, a.tech);
  }

  buyAbility(s: Squad, abilityId: string): boolean {
    const a = s.spec?.abilities.find((q) => q.id === abilityId);
    if (!a) return false;
    const c = this.checkAbility(s, a);
    if (!c.ok) return false;
    this.supplies -= c.cost;
    s.invested += c.cost;
    s.abilities.push(a.id);
    this.refreshStats(s);
    this.events.abilityBought?.(s, a.name);
    return true;
  }

  /** Recompute stats after tier/spec/ability/rank changes; tops up trooper HP by the gain. */
  private refreshStats(s: Squad): void {
    const oldHp = s.stats.hp;
    s.stats = computeStats(s);
    const gain = s.stats.hp - oldHp;
    for (const t of s.troopers) if (t.alive) t.hp = Math.min(s.stats.hp, t.hp + Math.max(0, gain));
    // Deploy or remove turrets to match.
    while (s.turrets.length < s.stats.turretCount) s.turrets.push({ x: s.anchorX, y: s.anchorY, angle: s.facing, cooldown: 0.5 });
    s.turrets.length = s.stats.turretCount;
    this.layoutTurrets(s);
  }

  private checkTech(): void {
    const t = this.tech;
    if (t !== this.lastTech) {
      this.lastTech = t;
      this.events.techChanged?.(t);
    }
  }

  sellValue(p: Placeable): number {
    const full = Balance.fullRefundBeforeNextWave && p.placedAtWave === this.wavesStarted;
    return Math.floor(p.invested * (full ? 1 : Balance.sellRefund));
  }

  sell(p: Placeable): number {
    if (p.removed || this.isOver) return 0;
    const refund = this.sellValue(p);
    this.supplies += refund;
    p.removed = true;
    if (p.kind === 'squad') {
      this.releaseEngaged(p);
      if (p.cover) this.coverOccupant.delete(p.cover.index);
      this.squads.splice(this.squads.indexOf(p), 1);
      this.events.squadRemoved?.(p, refund);
    } else {
      this.buildings.splice(this.buildings.indexOf(p), 1);
      this.events.buildingRemoved?.(p, refund);
      this.checkTech();
    }
    return refund;
  }

  rotate(squad: Squad, facing: number): void {
    squad.facing = Math.atan2(Math.sin(facing), Math.cos(facing));
    this.layoutTurrets(squad);
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

  /** Effective weapon range for a squad (stats + cover bonus). */
  rangeOf(s: Squad): number {
    let r = s.stats.range;
    if (s.cover) {
      r *= getCover(s.cover.type).rangeBonus;
      if (s.stats.coverBonus) r *= s.stats.coverBonus.range;
    }
    return r;
  }

  turretRange(s: Squad): number {
    return (s.stats.turretWeapon?.range ?? 0) * s.stats.turretRange;
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

    this.updateDetection(dt);
    this.updateAuras(dt);
    for (const s of this.squads) this.updateSquad(s, dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) this.updateEnemy(this.enemies[i], dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.updateShell(this.projectiles[i], i, dt);

    // Remove dead/leaked enemies (swap-remove keeps it O(1)).
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        const last = this.enemies.pop()!;
        if (i < this.enemies.length) this.enemies[i] = last;
        e.engaged = null;
        e.burnSource = null;
        this.enemyPool.push(e);
      }
    }

    this.checkWaveClears();
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.state = 'lost';
      this.events.gameOver?.(false);
    } else if (!this.endless && this.wavesStarted === this.totalWaves && this.waveSpawnDone.every(Boolean) && this.enemies.length === 0) {
      this.state = 'won';
      this.events.gameOver?.(true);
    }
  }

  // ---------------------------------------------------------------- waves

  private startWave(earlyBonus: number): void {
    const index = this.wavesStarted++;
    const wave = this.waveDef(index);
    this.waveAlive[index] = 0;
    this.waveSpawnDone[index] = false;
    this.waveCleared[index] = false;
    this.state = 'running';
    this.countdown = -1;
    for (const g of wave.groups) {
      this.groups.push({ group: g, wave: index, path: this.routeFor(g.enemy, g.path), spawned: 0, timer: g.delay });
    }
    if (wave.groups.length === 0) this.waveSpawnDone[index] = true;
    // Supply Depots pay out at the start of every wave after the first.
    if (index > 0) {
      for (const b of this.buildings) {
        const inc = b.def.tiers[b.tier].income ?? 0;
        if (inc > 0) {
          this.supplies += inc;
          this.events.income?.(b, inc);
        }
      }
    }
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
    const cur = this.wavesStarted - 1;
    if (this.state === 'running' && this.countdown < 0 && cur >= 0 && this.waveSpawnDone[cur] && this.wavesStarted < this.totalWaves) {
      this.countdown = this.countdownTotal = this.endless ? Endless.countdown : Balance.waveCountdown;
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
        const bonus = this.waveDef(i).clearBonus;
        this.supplies += bonus;
        this.events.waveCleared?.(i, bonus);
      }
    }
  }

  /** Which route an enemy type uses: fliers take a flight route, everyone else a road. */
  private routeFor(enemyId: string, name?: string): Path {
    const def = getEnemy(enemyId);
    if (def.flier && this.map.flights.length) {
      return this.map.flights.find((p) => p.name === name) ?? this.map.flights[this.rng.next() * this.map.flights.length | 0];
    }
    const roads = this.map.paths;
    if (name) {
      const p = roads.find((q) => q.name === name);
      if (p) return p;
    }
    // Unnamed groups alternate between roads on multi-road maps.
    return roads[this.rng.next() * roads.length | 0];
  }

  private spawnEnemy(id: string, path: Path, wave: number, startDist = 0): Enemy {
    const def = getEnemy(id);
    const e: Enemy = this.enemyPool.pop() ?? ({} as Enemy);
    e.id = this.nextId++;
    e.def = def;
    e.alive = true;
    e.path = path;
    e.dist = startDist;
    e.lane = this.rng.range(-0.32, 0.32) * path.width * (def.radius > 20 ? 0.2 : 1);
    e.heading = path.sample(startDist, this.tmp);
    e.x = e.prevX = this.tmp.x;
    e.y = e.prevY = this.tmp.y;
    const scale = this.endless ? endlessScale(wave) : { hp: 1, speed: 1 };
    const capMult = this.endless ? (this.waveDef(wave) as GeneratedWave).hpMult : 1;
    scale.hp *= capMult;
    e.bountyMult = capMult;
    e.hp = e.maxHp = def.hp * scale.hp;
    e.shield = e.maxShield = def.shield * scale.hp;
    e.speedMult = scale.speed;
    e.shieldTimer = 0;
    e.attackCd = this.rng.range(0.2, 1);
    e.engaged = null;
    e.berserk = false;
    e.wave = wave;
    e.slowT = e.slowMult = e.stunT = e.markT = e.markMult = e.markBounty = 0;
    e.suppressT = e.suppressMult = e.burnT = e.burnDps = 0;
    e.burnSource = null;
    e.revealT = 0;
    e.revealed = !def.cloaked;
    e.carrierState = 0;
    e.hoverT = 0;
    e.dropDist = path.length * 0.55;
    if (def.carrier && this.map.drops.length) {
      // Unload at the drop point closest to this route.
      let best = Infinity;
      for (const d of this.map.drops) {
        const along = path.distanceAt(d.x, d.y);
        path.sample(along, this.tmp);
        const off = Math.hypot(this.tmp.x - d.x, this.tmp.y - d.y);
        if (off < best) {
          best = off;
          e.dropDist = along;
        }
      }
    }
    e.phaseIdx = 0;
    e.armorMod = 0;
    e.stompCd = 2;
    this.enemies.push(e);
    this.waveAlive[wave]++;
    this.events.enemySpawned?.(e);
    return e;
  }

  /** Can squads/turrets aim at this enemy right now? */
  private targetable(e: Enemy): boolean {
    return e.alive && e.revealed;
  }

  /** Cloaked enemies are revealed near detectors (Sensor Pylons, Spotter optics) or briefly after attacking. */
  private updateDetection(dt: number): void {
    for (const e of this.enemies) {
      if (!e.def.cloaked || !e.alive) continue;
      if (e.revealT > 0) e.revealT -= dt;
      let seen = e.revealT > 0;
      if (!seen) {
        for (const b of this.buildings) {
          const r = b.def.tiers[b.tier].detect ?? 0;
          if (r && Math.hypot(b.x - e.x, b.y - e.y) <= r) {
            seen = true;
            break;
          }
        }
      }
      if (!seen) {
        for (const s of this.squads) {
          if (s.stats.detect && !s.down && Math.hypot(s.x - e.x, s.y - e.y) <= s.stats.detect) {
            seen = true;
            break;
          }
        }
      }
      e.revealed = seen;
    }
  }

  /** Sensor/detector coverage for the renderer. */
  detectors(): { x: number; y: number; r: number }[] {
    const out: { x: number; y: number; r: number }[] = [];
    for (const b of this.buildings) {
      const r = b.def.tiers[b.tier].detect ?? 0;
      if (r) out.push({ x: b.x, y: b.y, r });
    }
    for (const s of this.squads) if (s.stats.detect) out.push({ x: s.x, y: s.y, r: s.stats.detect });
    return out;
  }

  // ---------------------------------------------------------------- squads

  /** Trooper formation: a shallow arc facing `squad.facing`, centered on the squad position. */
  private slot(squad: Squad, i: number, out: Vec): Vec {
    const n = squad.troopers.length;
    const spacing = n > 2 ? 15 : 17;
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

  /** Turrets sit in a row in front of the squad's anchor. */
  private layoutTurrets(s: Squad): void {
    const n = s.turrets.length;
    const c = Math.cos(s.facing), sn = Math.sin(s.facing);
    for (let i = 0; i < n; i++) {
      const lateral = (i - (n - 1) / 2) * Balance.turretSpacing;
      const fwd = n % 2 === 1 && i === (n - 1) / 2 ? 52 : 38;
      const t = s.turrets[i];
      t.x = s.anchorX + fwd * c - lateral * sn;
      t.y = s.anchorY + fwd * sn + lateral * c;
      if (!isFinite(t.angle)) t.angle = s.facing;
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

  /** Support auras (medics/engineers): heal, fire-rate and reinforce buffs. */
  private updateAuras(dt: number): void {
    for (const s of this.squads) {
      s.auraRof = 1;
      s.auraReinforce = 1;
    }
    for (const src of this.squads) {
      const a = src.stats.aura;
      if (src.down) continue;
      if (src.stats.revive) {
        src.reviveCd -= dt;
        if (src.reviveCd <= 0) {
          for (const q of this.squads) {
            if (q.down && Math.hypot(q.x - src.x, q.y - src.y) <= src.stats.revive.radius) {
              this.restoreSquad(q, true);
              src.reviveCd = src.stats.revive.cooldown;
              break;
            }
          }
        }
      }
      if (!a) continue;
      for (const q of this.squads) {
        if (q.down || Math.hypot(q.x - src.x, q.y - src.y) > a.radius) continue;
        if (a.heal > 0) for (const t of q.troopers) if (t.alive) t.hp = Math.min(q.stats.hp, t.hp + a.heal * dt);
        q.auraRof = Math.max(q.auraRof, a.rof);
        q.auraReinforce = Math.max(q.auraReinforce, a.reinforce);
      }
    }
  }

  private restoreSquad(s: Squad, revived: boolean): void {
    s.down = false;
    s.sinceHit = 99;
    for (const t of s.troopers) {
      t.alive = true;
      t.hp = s.stats.hp;
    }
    s.x = s.rallyX;
    s.y = s.rallyY;
    this.layoutTroopers(s, true);
    this.updateCover(s);
    this.events.squadRestored?.(s, revived);
  }

  private updateSquad(s: Squad, dt: number): void {
    for (const t of s.troopers) {
      t.prevX = t.x;
      t.prevY = t.y;
    }
    // Turrets keep shooting even while the crew is down.
    if (s.turrets.length) this.updateTurrets(s, dt);

    if (s.down) {
      s.downTimer -= dt;
      if (s.downTimer <= 0) this.restoreSquad(s, false);
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
    if (s.sinceHit >= Balance.reinforceDelay / s.auraReinforce) {
      const maxHp = s.stats.hp;
      let missing: Trooper | null = null;
      for (const t of s.troopers) {
        if (t.alive) t.hp = Math.min(maxHp, t.hp + maxHp * 0.15 * dt);
        else if (!missing) missing = t;
      }
      if (missing) {
        s.reinforceTimer += dt * s.auraReinforce;
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

    const st = s.stats;
    const range = this.rangeOf(s);
    s.target = this.pickTarget(s, range, st.arcDeg);

    // Aim.
    for (const t of s.troopers) {
      if (!t.alive) continue;
      const want = s.target ? Math.atan2(s.target.y - t.y, s.target.x - t.x) : s.facing;
      const diff = angleDiff(want, t.angle);
      const maxTurn = 7 * dt;
      t.angle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
    }

    // Spin-up builds while firing, decays otherwise.
    if (st.spinUp) s.spin = Math.max(0, Math.min(1, s.spin + (s.target ? dt / st.spinUp.seconds : -dt)));

    const lead = this.leadTrooper(s);
    // Secondary weapons.
    if (st.flame && lead) {
      s.flameCd -= dt;
      if (s.flameCd <= 0 && s.target && Math.hypot(s.target.x - s.x, s.target.y - s.y) <= st.flame.range + s.target.def.radius) {
        s.flameCd = st.flame.interval;
        this.fireFlame(s, lead, Math.atan2(s.target.y - lead.y, s.target.x - lead.x));
      }
    }
    if (st.grenade && lead) {
      s.grenadeCd -= dt;
      if (s.grenadeCd <= 0 && s.target) {
        s.grenadeCd = st.grenade.interval;
        this.fireShell(s, lead, s.target, st.grenade.damage, st.grenade.radius, 300, 'shell', st.grenade.stun, false);
      }
    }

    if (!s.target) return;
    const target = s.target;
    let rof = st.rof * s.auraRof * (st.spinUp ? 1 + st.spinUp.maxBonus * s.spin : 1);
    if (s.cover && st.coverBonus) rof *= st.coverBonus.rof;

    if (s.def.crewServed) {
      s.crewCooldown -= dt;
      if (s.crewCooldown > 0 || !lead) return;
      let alive = 0;
      for (const t of s.troopers) if (t.alive) alive++;
      if (Math.abs(angleDiff(Math.atan2(target.y - lead.y, target.x - lead.x), lead.angle)) > 0.3) return;
      s.crewCooldown = 1 / (rof * Math.pow(alive / s.troopers.length, Balance.crewPenaltyExponent));
      if (st.projectile) {
        const targets = st.multishot ? this.pickTargets(s, range, st.arcDeg, st.multishot.count) : null;
        if (targets && targets.length > 1) {
          for (const e of targets) this.fireShell(s, lead, e, st.damage * st.multishot!.dmgMult, st.splash, st.projectileSpeed, st.projectile, 0, true);
        } else {
          this.fireShell(s, lead, target, st.damage, st.splash, st.projectileSpeed, st.projectile, 0, true);
        }
      } else {
        this.fireBullet(s, lead, target, st);
      }
    } else {
      for (const t of s.troopers) {
        if (!t.alive) continue;
        t.cooldown -= dt;
        if (t.cooldown > 0) continue;
        if (Math.abs(angleDiff(Math.atan2(target.y - t.y, target.x - t.x), t.angle)) > 0.3) continue;
        t.cooldown = (1 / rof) * this.rng.range(0.85, 1.15);
        this.fireBullet(s, t, target, st);
        if (!target.alive) break;
      }
    }
  }

  private leadTrooper(s: Squad): Trooper | null {
    for (const t of s.troopers) if (t.alive) return t;
    return null;
  }

  private fireBullet(s: Squad, t: Trooper, target: Enemy, st: SquadStats): void {
    const hit = this.rng.chance(st.accuracy);
    let tx = target.x, ty = target.y;
    if (!hit) {
      tx += this.rng.range(-22, 22);
      ty += this.rng.range(-22, 22);
    }
    let dmg = st.damage;
    if (st.firstShot > 1 && s.lastTargetId !== target.id) dmg *= st.firstShot;
    s.lastTargetId = target.id;
    this.events.shot?.(s, t, tx, ty, hit);
    if (!hit) return;
    this.damageEnemy(target, dmg, st.damageType, s, st);
    if (st.pierceTargets) this.pierceThrough(s, t, target, dmg * st.pierceTargets.dmgMult, st.pierceTargets.count, st);
  }

  /** Overpenetration: hit up to `count` enemies roughly in line behind the target. */
  private pierceThrough(s: Squad, from: Trooper, target: Enemy, dmg: number, count: number, st: SquadStats): void {
    const dx = target.x - from.x, dy = target.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const reach = this.rangeOf(s) * 1.15;
    const near = this.hash.query(target.x + ux * reach * 0.3, target.y + uy * reach * 0.3, reach * 0.6, this.near);
    let hits = 0;
    // Sort candidates by distance along the ray (small list; insertion into picks).
    this.picks.length = 0;
    for (const e of near) {
      if (!e.alive || e === target) continue;
      const px = e.x - from.x, py = e.y - from.y;
      const along = px * ux + py * uy;
      if (along <= len || along > reach) continue;
      const side = Math.abs(px * uy - py * ux);
      if (side > e.def.radius + 8) continue;
      this.picks.push(e);
    }
    this.picks.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    for (const e of this.picks) {
      if (hits >= count) break;
      this.damageEnemy(e, dmg, st.damageType, s, st);
      hits++;
    }
    if (hits > 0) {
      const last = this.picks[Math.min(hits, this.picks.length) - 1];
      this.events.shot?.(s, from, last.x, last.y, true);
    }
  }

  private fireFlame(s: Squad, t: Trooper, angle: number): void {
    const f = s.stats.flame!;
    const half = (f.arcDeg * Math.PI) / 360;
    this.events.flame?.(s, t, angle, f.range, f.arcDeg);
    const near = this.hash.query(t.x, t.y, f.range + 20, this.near);
    for (const e of near) {
      if (!e.alive) continue;
      const dx = e.x - t.x, dy = e.y - t.y;
      if (Math.hypot(dx, dy) > f.range + e.def.radius) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > half) continue;
      if (e.def.flier) continue; // flames can't reach fliers
      this.damageEnemy(e, f.damage, 'fire', s, null);
      if (e.alive) {
        e.burnT = Math.max(e.burnT, f.burnTime);
        e.burnDps = Math.max(e.burnDps, f.burnDps);
        e.burnSource = s;
      }
    }
  }

  private updateTurrets(s: Squad, dt: number): void {
    const w = s.stats.turretWeapon;
    if (!w) return;
    const range = this.turretRange(s);
    for (const tu of s.turrets) {
      tu.cooldown -= dt;
      // Closest-to-exit enemy in range, 360°.
      let best: Enemy | null = null;
      const near = this.hash.query(tu.x, tu.y, range + 20, this.near);
      for (const e of near) {
        if (!this.targetable(e)) continue;
        if (Math.hypot(e.x - tu.x, e.y - tu.y) > range + e.def.radius) continue;
        if (!best || e.dist > best.dist) best = e;
      }
      if (!best) continue;
      const want = Math.atan2(best.y - tu.y, best.x - tu.x);
      const diff = angleDiff(want, tu.angle);
      tu.angle += Math.abs(diff) <= 9 * dt ? diff : Math.sign(diff) * 9 * dt;
      if (tu.cooldown > 0 || Math.abs(diff) > 0.3) continue;
      tu.cooldown = 1 / w.rof;
      this.events.turretShot?.(s, tu, best.x, best.y);
      const aa = best.def.flier && s.stats.antiAir ? Balance.antiAirBonus : 1;
      this.damageEnemy(best, w.damage * s.stats.turretDamage * aa, w.damageType, s, null);
    }
  }

  private targetScore(s: Squad, e: Enemy, dSq: number): number {
    let score: number;
    switch (s.targetMode) {
      case 'first': score = e.dist; break;
      case 'strongest': score = e.hp + e.shield; break;
      case 'weakest': score = -(e.hp + e.shield); break;
      case 'closest': score = -dSq; break;
    }
    // Melee enemies already fighting this squad get priority (self-defense).
    if (e.engaged === s) score += 1e6;
    return score;
  }

  private inArc(s: Squad, e: Enemy, range: number, half: number): number {
    if (!this.targetable(e)) return -1;
    // Lobbed grenades can't hit fliers (rockets and bullets can).
    if (e.def.flier && s.stats.projectile === 'shell') return -1;
    const dx = e.x - s.x, dy = e.y - s.y;
    const dSq = dx * dx + dy * dy;
    const reach = range + e.def.radius;
    if (dSq > reach * reach) return -1;
    if (half < Math.PI && Math.abs(angleDiff(Math.atan2(dy, dx), s.facing)) > half) return -1;
    return dSq;
  }

  private pickTarget(s: Squad, range: number, arcDeg: number): Enemy | null {
    const half = (arcDeg * Math.PI) / 360;
    const candidates = this.hash.query(s.x, s.y, range + 20, this.near);
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      const dSq = this.inArc(s, e, range, half);
      if (dSq < 0) continue;
      const score = this.targetScore(s, e, dSq);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private pickTargets(s: Squad, range: number, arcDeg: number, count: number): Enemy[] {
    const half = (arcDeg * Math.PI) / 360;
    const candidates = this.hash.query(s.x, s.y, range + 20, this.near);
    const picks = this.picks;
    picks.length = 0;
    for (const e of candidates) if (this.inArc(s, e, range, half) >= 0) picks.push(e);
    picks.sort((a, b) => this.targetScore(s, b, (b.x - s.x) ** 2 + (b.y - s.y) ** 2) - this.targetScore(s, a, (a.x - s.x) ** 2 + (a.y - s.y) ** 2));
    if (picks.length > count) picks.length = count;
    return picks;
  }

  private fireShell(s: Squad, gunner: Trooper, target: Enemy, damage: number, radius: number, speed: number, kind: 'shell' | 'rocket', stun: number, useOwnerStats: boolean): void {
    const p: Projectile = this.shellPool.pop() ?? ({} as Projectile);
    const muzzleX = gunner.x + Math.cos(gunner.angle) * 12;
    const muzzleY = gunner.y + Math.sin(gunner.angle) * 12;
    // Lead the target: aim where it will be when the shell lands.
    let flight = Math.hypot(target.x - muzzleX, target.y - muzzleY) / speed;
    let tx = target.x, ty = target.y;
    if (!target.engaged && target.stunT <= 0) {
      const spd = this.enemySpeed(target);
      tx += Math.cos(target.heading) * spd * flight;
      ty += Math.sin(target.heading) * spd * flight;
      flight = Math.hypot(tx - muzzleX, ty - muzzleY) / speed;
    }
    p.active = true;
    p.owner = s;
    p.kind = kind;
    p.x0 = p.x = p.prevX = muzzleX;
    p.y0 = p.y = p.prevY = muzzleY;
    p.tx = tx;
    p.ty = ty;
    p.t = 0;
    p.dur = Math.max(0.1, flight);
    p.damage = damage;
    p.radius = radius;
    p.damageType = useOwnerStats ? s.stats.damageType : 'explosive';
    p.stun = stun;
    p.useOwnerStats = useOwnerStats;
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
    const owner = p.owner && !p.owner.removed ? p.owner : null;
    const st = p.useOwnerStats && owner ? owner.stats : null;
    const near = this.hash.query(p.tx, p.ty, p.radius + 20, this.near);
    for (const e of near) {
      if (!e.alive) continue;
      if (e.def.flier && p.kind !== 'rocket') continue;
      const d = Math.hypot(e.x - p.tx, e.y - p.ty) - e.def.radius * 0.5;
      if (d > p.radius) continue;
      const falloff = 1 - (1 - Balance.splashEdgeFactor) * Math.max(0, d / p.radius);
      this.damageEnemy(e, p.damage * falloff, p.damageType, owner, st);
      if (p.stun > 0 && e.alive) e.stunT = Math.max(e.stunT, p.stun);
    }
    this.events.explosion?.(p.tx, p.ty, p.radius, p.kind);
    p.active = false;
    p.owner = null;
    const last = this.projectiles.pop()!;
    if (index < this.projectiles.length) this.projectiles[index] = last;
    this.shellPool.push(p);
  }

  private damageSquad(s: Squad, amount: number): Trooper | null {
    if (s.down || s.removed) return null;
    const cover = s.cover ? getCover(s.cover.type).damageReduction : 0;
    const dmg = amount * (1 - cover) * (1 - s.stats.armor);
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

  private awardXp(s: Squad, xp: number): void {
    s.xp += xp;
    const t = Balance.veterancyXp;
    const rank = s.xp >= t[2] ? 3 : s.xp >= t[1] ? 2 : s.xp >= t[0] ? 1 : 0;
    if (rank > s.rank) {
      s.rank = rank;
      this.refreshStats(s);
      this.events.squadPromoted?.(s);
    }
  }

  // ---------------------------------------------------------------- enemies

  private damageEnemy(e: Enemy, amount: number, type: DamageType, source: Squad | null, st: SquadStats | null): void {
    if (!e.alive) return;
    let dmg = amount;
    if (st?.antiAir && e.def.flier) dmg *= Balance.antiAirBonus;
    if (st && st.armoredMult !== 1 && e.def.armor >= 0.3) dmg *= st.armoredMult;
    if (e.markT > 0) dmg *= 1 + e.markMult;
    let remaining = dmg;
    let shieldHit = false;
    e.shieldTimer = 0;
    if (e.shield > 0) {
      shieldHit = true;
      const mult = Balance.shieldMultiplier[type] * (st?.shieldMult ?? 1);
      const shieldDmg = dmg * mult;
      if (shieldDmg >= e.shield) {
        remaining = (shieldDmg - e.shield) / mult;
        e.shield = 0;
        this.events.shieldBroken?.(e);
      } else {
        e.shield -= shieldDmg;
        remaining = 0;
      }
    }
    const pierce = Math.min(1, Balance.pierce[type] + (st?.pierceBonus ?? 0));
    const armor = Math.max(0, e.def.armor - e.armorMod);
    const dealt = remaining * (1 - armor * (1 - pierce));
    e.hp -= dealt;
    this.events.enemyDamaged?.(e, shieldHit ? dmg : dealt, shieldHit && remaining === 0);

    if (e.hp <= 0) {
      e.alive = false;
      this.waveAlive[e.wave]--;
      if (e.engaged) {
        e.engaged.engagedBy = Math.max(0, e.engaged.engagedBy - 1);
        e.engaged = null;
      }
      const bounty = Math.round(e.def.bounty * e.bountyMult * (1 + (e.markT > 0 ? e.markBounty : 0)));
      this.supplies += bounty;
      this.kills++;
      if (source && !source.removed) {
        source.kills++;
        this.awardXp(source, e.def.bounty);
      }
      this.events.enemyKilled?.(e, bounty);
      return;
    }
    const ph = e.def.phases;
    if (ph && e.phaseIdx < ph.at.length && e.hp / e.maxHp < ph.at[e.phaseIdx]) {
      e.phaseIdx++;
      e.armorMod += ph.armorDrop;
      e.speedMult *= ph.speedUp;
      for (let i = 0; i < ph.spawn.count; i++) {
        this.spawnEnemy(ph.spawn.enemy, e.path, e.wave, Math.max(0, e.dist - 10 - this.rng.next() * 40));
      }
      this.events.bossPhase?.(e, e.phaseIdx);
    }
    if (!e.berserk && e.def.berserkAt > 0 && e.hp / e.maxHp < e.def.berserkAt) {
      e.berserk = true;
      this.events.enemyBerserk?.(e);
    }
    if (st) {
      for (const o of st.onHit) {
        switch (o.status) {
          case 'slow':
            e.slowMult = e.slowT > 0 ? Math.max(e.slowMult, o.strength) : o.strength;
            e.slowT = Math.max(e.slowT, o.duration);
            break;
          case 'mark':
            e.markMult = e.markT > 0 ? Math.max(e.markMult, o.strength) : o.strength;
            e.markT = Math.max(e.markT, o.duration);
            e.markBounty = Math.max(e.markBounty, st.markBounty);
            break;
          case 'stun':
            e.stunT = Math.max(e.stunT, o.duration);
            break;
          case 'suppress':
            e.suppressMult = e.suppressT > 0 ? Math.max(e.suppressMult, o.strength) : o.strength;
            e.suppressT = Math.max(e.suppressT, o.duration);
            break;
          case 'burn':
            e.burnDps = Math.max(e.burnDps, o.strength);
            e.burnT = Math.max(e.burnT, o.duration);
            e.burnSource = source;
            break;
        }
      }
    }
  }

  private enemySpeed(e: Enemy): number {
    return e.def.speed * e.speedMult * (e.berserk ? Balance.berserkSpeed : 1) * (e.slowT > 0 ? 1 - e.slowMult : 1);
  }

  private unload(barge: Enemy): void {
    barge.carrierState = 2;
    // Nearest road to where the barge is hovering.
    let road = this.map.paths[0];
    let best = Infinity;
    for (const p of this.map.paths) {
      const d = p.distSqTo(barge.x, barge.y);
      if (d < best) {
        best = d;
        road = p;
      }
    }
    const along = road.distanceAt(barge.x, barge.y);
    for (const t of barge.def.carrier!.troops) {
      for (let i = 0; i < t.count; i++) {
        this.spawnEnemy(t.enemy, road, barge.wave, Math.max(0, along + this.rng.range(-30, 30)));
      }
    }
    this.events.bargeUnload?.(barge);
  }

  private updateEnemy(e: Enemy, dt: number): void {
    if (!e.alive) return;
    e.prevX = e.x;
    e.prevY = e.y;
    const def = e.def;

    // Status timers.
    if (e.slowT > 0) e.slowT -= dt;
    if (e.markT > 0) e.markT -= dt;
    if (e.suppressT > 0) e.suppressT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt;
      this.damageEnemy(e, e.burnDps * dt, 'fire', e.burnSource && !e.burnSource.removed ? e.burnSource : null, null);
      if (!e.alive) return;
    }

    if (e.maxShield > 0 && e.shield < e.maxShield) {
      e.shieldTimer += dt;
      if (e.shieldTimer >= def.shieldDelay) e.shield = Math.min(e.maxShield, e.shield + def.shieldRegen * (e.maxShield / def.shield) * dt);
    }

    if (e.stunT > 0) {
      e.stunT -= dt;
      return; // stunned: no moving, no attacking
    }

    const dmgMult = e.berserk ? Balance.berserkDamage : 1;
    e.attackCd -= dt * (e.suppressT > 0 ? 1 - e.suppressMult : 1);

    // Tender: heal and recharge nearby aliens.
    const heal = def.healAura;
    if (heal) {
      for (const o of this.hash.query(e.x, e.y, heal.radius, this.near)) {
        if (o === e || !o.alive || Math.hypot(o.x - e.x, o.y - e.y) > heal.radius) continue;
        const before = o.hp + o.shield;
        o.hp = Math.min(o.maxHp, o.hp + heal.heal * dt);
        if (o.maxShield > 0) o.shield = Math.min(o.maxShield, o.shield + heal.shield * dt);
        if (o.hp + o.shield > before + 0.01 && this.rng.next() < dt * 2) this.events.healPulse?.(e, o);
      }
    }

    // Boss stomp: hits every squad close by.
    if (def.stomp) {
      e.stompCd -= dt;
      if (e.stompCd <= 0) {
        let hitAny = false;
        for (const q of this.squads) {
          if (q.down || Math.hypot(q.x - e.x, q.y - e.y) > def.stomp.radius) continue;
          hitAny = true;
          this.damageSquad(q, def.stomp.damage * dmgMult);
          this.damageSquad(q, def.stomp.damage * dmgMult);
        }
        if (hitAny) {
          e.stompCd = 1 / def.stomp.rate;
          this.events.stomp?.(e, def.stomp.radius);
        } else e.stompCd = 0.3;
      }
    }

    // Dropship: hover over the drop point and unload troops onto the nearest road.
    if (def.carrier) {
      if (e.carrierState === 0 && e.dist >= e.dropDist) {
        e.carrierState = 1;
        e.hoverT = def.carrier.hover;
      }
      if (e.carrierState === 1) {
        e.hoverT -= dt;
        if (e.hoverT <= 0) this.unload(e);
        return; // hovering
      }
    }

    if (def.attack.kind === 'melee' && !def.unblockable && def.attack.damage > 0) {
      const s = e.engaged;
      if (s && (s.down || s.removed || Math.hypot(s.x - e.x, s.y - e.y) > def.attack.range + 30)) {
        s.engagedBy = Math.max(0, s.engagedBy - 1);
        e.engaged = null;
      }
      if (!e.engaged) {
        for (const q of this.squads) {
          if (q.down || q.engagedBy >= q.stats.blockCap) continue;
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
          if (def.cloaked) e.revealT = Balance.revealOnAttack;
          if (victim) this.events.enemyMelee?.(e, q, victim);
        }
        return; // held in place
      }
    } else if (def.attack.kind === 'ranged' && def.attack.damage > 0 && e.attackCd <= 0) {
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
        if (def.cloaked) e.revealT = Balance.revealOnAttack;
        if (victim) this.events.enemyShot?.(e, best, victim);
      } else {
        e.attackCd = 0.2; // look again soon
      }
    }

    // Walk the path.
    e.dist += this.enemySpeed(e) * dt;
    if (e.dist >= e.path.length) {
      e.alive = false;
      this.waveAlive[e.wave]--;
      this.integrity -= def.leak;
      this.events.enemyLeaked?.(e);
      return;
    }
    e.heading = e.path.sample(e.dist, this.tmp);
    const lane = e.lane * Math.min(1, e.dist / 40);
    e.x = this.tmp.x - Math.sin(e.heading) * lane;
    e.y = this.tmp.y + Math.cos(e.heading) * lane;
  }
}

/** Turret type re-export for the renderer. */
export type { Enemy };

export type { Turret };
