/**
 * Draws the simulation each frame and turns simulation events into effects and sounds.
 *
 * Positions are interpolated between the last two simulation ticks (`alpha`) so motion stays
 * smooth at 60/120 fps even though the simulation runs at 30 ticks per second.
 */
import Phaser from 'phaser';
import { addArt, art } from '../assets/art';
import { Palette } from '../assets/palette';
import { ART_SCALE } from '../assets/placeholderArt';
import { sfx } from '../audio/Sfx';
import { Balance } from '../data/balance';
import type { Building, Enemy, Placeable, Projectile, Squad, Trooper, Turret } from '../sim/entities';
import type { SimEvents } from '../sim/events';
import type { World } from '../sim/World';
import { Depth } from './depth';
import { Effects, FIRE_RAMP } from './Effects';
import { MapView } from './MapView';
import { WEAPON_POINTS, weaponOf } from '../assets/soldiers';
import { TURRET_FX, VEHICLE_FX, WEAPON_FX, type WeaponFx } from './weaponFx';
import { VEHICLE_POINTS } from '../assets/vehicleArt';
import { HERO_LEVEL_XP } from '../data/heroes';
import { FLASH_ORIGIN } from '../assets/fxArt';

/** Units are drawn a bit larger than their simulation size so they read well on small screens. */
export const UNIT_DRAW_SCALE = 1.4;
/** Vehicles are big already; a smaller boost keeps them inside their footprint. */
export const VEHICLE_SCALE = 1.2;
/** Heroes stand a little taller than troopers. */
export const HERO_SCALE = 1.25;

type Img = Phaser.GameObjects.Image;

interface TrooperView {
  body: Img;
  shadow: Img;
  /** Vehicles: the hull under the turret (`body`). */
  hull?: Img;
  /** Art rotation offset (sprites drawn facing up instead of right, etc.). */
  rot: number;
}

interface TurretView {
  body: Img;
  shadow: Img;
}

interface SquadView {
  squad: Squad;
  troopers: TrooperView[];
  turrets: TurretView[];
  arc: Phaser.GameObjects.Graphics;
  bars: Phaser.GameObjects.Graphics;
  arcKey: string;
  barsKey: string;
  artKey: string;
  hero?: { ring: Img; tag: Phaser.GameObjects.Text; bubble: Img };
}

interface BuildingView {
  b: Building;
  body: Img;
  shadow: Img;
  glow: Img | null;
  bars: Phaser.GameObjects.Graphics;
  tier: number;
}

interface EnemyView {
  body: Img;
  shadow: Img;
  shield: Img;
  barBg: Img;
  barFill: Img;
  shieldFill: Img;
  mark: Img;
  stun: Img;
  /** Healing-aura ring (Tenders) / tractor beam glow (dropships). */
  aura: Img;
  flash: number;
  shieldFlash: number;
  burnFx: number;
  hidden: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Which art each trooper of a squad uses (changes when the squad specializes). */
export function trooperArt(s: { def: Squad['def']; spec: Squad['spec'] }, i: number): string {
  const lead = s.spec?.leadArt ?? s.def.leadArt;
  if (i === 0 && lead) return lead;
  return s.spec?.art ?? s.def.art;
}

export class WorldRenderer implements SimEvents {
  readonly fx: Effects;
  readonly mapView: MapView;
  private squadViews = new Map<Squad, SquadView>();
  private buildingViews = new Map<Building, BuildingView>();
  private enemyViews = new Map<Enemy, EnemyView>();
  private freeEnemyViews = new Map<string, EnemyView[]>();
  private shellViews: { shell: Img; shadow: Img; kind: string }[] = [];
  private mineViews: Img[] = [];
  private t = 0;
  selected: Placeable | null = null;
  onIntegrityHit?: () => void;
  /** UI hooks for toasts. */
  onNotice?: (text: string) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.mapView = new MapView(scene, world);
    this.fx = new Effects(scene);
    // Pre-warm enemy views so the first big wave doesn't hitch.
    for (const id of ['skitter', 'warden', 'ironback']) {
      const list: EnemyView[] = [];
      for (let i = 0; i < (id === 'skitter' ? 40 : 10); i++) list.push(this.makeEnemyView(`enemy.${id}`));
      this.freeEnemyViews.set(`enemy.${id}`, list);
    }
    world.events = this;
    this.fx.startAmbient(world.map.width, world.map.height);
    this.fx.onClink = () => sfx.casing();
  }

  // ================================================================== weapon geometry

  private tmpP = { x: 0, y: 0 };
  private tmpE = { x: 0, y: 0 };
  private shotCount = 0;

  /** World position of a point given in the soldier's design box, for a trooper. */
  private soldierPoint(t: Trooper, px: number, py: number, out: { x: number; y: number }): { x: number; y: number } {
    const fwd = (px - 12) * UNIT_DRAW_SCALE, lat = (py - 14) * UNIT_DRAW_SCALE;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    out.x = t.x + c * fwd - s * lat;
    out.y = t.y + s * fwd + c * lat;
    return out;
  }

  /** Muzzle flash + glow + smoke + casing for a weapon, from a trooper. Returns the muzzle point. */
  private fireFx(s: Squad, t: Trooper, override?: WeaponFx): { x: number; y: number } {
    const turretId = trooperArt(s, 0);
    const vp = VEHICLE_POINTS[turretId];
    if (vp) {
      const style = VEHICLE_FX[turretId];
      this.shotCount++;
      const mz = vp.muzzles[this.shotCount % vp.muzzles.length];
      const m = this.vehiclePoint(t, vp.pivot, mz, this.tmpP);
      this.muzzleFlash(m.x, m.y, t.angle, style);
      if (style.casing && this.shotCount % style.casingEvery === 0) {
        const e = this.vehiclePoint(t, vp.pivot, vp.eject, this.tmpE);
        this.fx.casing(e.x, e.y, t.angle, style.casing);
      }
      return m;
    }
    const idx = s.troopers.indexOf(t);
    const kind = weaponOf(trooperArt(s, Math.max(0, idx)));
    const pts = WEAPON_POINTS[kind];
    const style = override ?? WEAPON_FX[kind];
    const m = this.soldierPoint(t, pts.muzzle[0], pts.muzzle[1], this.tmpP);
    this.muzzleFlash(m.x, m.y, t.angle, style);
    this.shotCount++;
    if (style.casing && this.shotCount % style.casingEvery === 0) {
      const e = this.soldierPoint(t, pts.eject[0], pts.eject[1], this.tmpE);
      this.fx.casing(e.x, e.y, t.angle, style.casing);
      if (kind === 'gatling' && this.shotCount % 3 === 0) this.fx.casing(e.x, e.y, t.angle, 'link');
    }
    return m;
  }

  private vehiclePoint(t: Trooper, pivot: [number, number], p: [number, number], out: { x: number; y: number }): { x: number; y: number } {
    const fwd = (p[0] - pivot[0]) * VEHICLE_SCALE, lat = (p[1] - pivot[1]) * VEHICLE_SCALE;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    out.x = t.x + c * fwd - s * lat;
    out.y = t.y + s * fwd + c * lat;
    return out;
  }

  private muzzleFlash(x: number, y: number, angle: number, style: WeaponFx): void {
    const tex = style.flash[(Math.random() * style.flash.length) | 0];
    const len = style.flashLen * (0.85 + Math.random() * 0.35);
    const o = FLASH_ORIGIN[tex] ?? 0;
    const sc = len / (this.scene.textures.get(tex).getSourceImage().width * (1 - o));
    const rot = angle + (Math.random() - 0.5) * 0.12;
    this.fx.flash(tex, x, y, rot, sc, sc * 1.15, 0.055, style.flashTint, 1, Depth.muzzle, o);
    this.fx.light(x, y, style.glow, style.glowColor, 0.42, 0.07);
    if (style.smoke) this.fx.muzzleSmoke(x, y, angle, style.smoke);
    if (style.shake) this.fx.shake(style.shake, 70);
  }

  // ================================================================== views

  private makeEnemyView(artId: string): EnemyView {
    const s = this.scene;
    const v: EnemyView = {
      shadow: s.add.image(0, 0, 'fx.shadow').setDepth(Depth.shadow),
      body: addArt(s, artId).setDepth(Depth.enemy).setScale(art(artId).scale * (artId === 'enemy.broodbarge' ? 1.1 : UNIT_DRAW_SCALE)),
      shield: s.add.image(0, 0, 'fx.shieldBubble').setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.shield),
      barBg: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setTint(0x000000).setAlpha(0.7).setDepth(Depth.bars),
      barFill: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setDepth(Depth.bars),
      shieldFill: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setTint(Palette.shield).setDepth(Depth.bars),
      mark: addArt(s, 'fx.mark').setDepth(Depth.bars).setScale(ART_SCALE * 0.9),
      stun: addArt(s, 'fx.stun').setDepth(Depth.bars),
      aura: s.add.image(0, 0, 'fx.ring').setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.decal),
      flash: 0,
      shieldFlash: 0,
      burnFx: 0,
      hidden: false,
    };
    this.hideEnemyView(v);
    return v;
  }

  private hideEnemyView(v: EnemyView): void {
    v.hidden = true;
    for (const o of [v.body, v.shadow, v.shield, v.barBg, v.barFill, v.shieldFill, v.mark, v.stun, v.aura]) o.setVisible(false);
  }

  private makeTrooperView(id: string): TrooperView {
    const body = addArt(this.scene, id).setDepth(Depth.trooper);
    body.setScale(body.scale * UNIT_DRAW_SCALE);
    return {
      shadow: this.scene.add.image(0, 0, 'fx.shadow').setDisplaySize(28, 28).setDepth(Depth.shadow),
      body,
      rot: art(id).rotation,
    };
  }

  private makeSquadView(s: Squad): SquadView {
    const sc = this.scene;
    const troopers = s.troopers.map((_, i) => this.makeTrooperView(trooperArt(s, i)));
    const hullId = s.spec?.vehicleHull ?? s.def.vehicleHull;
    if (hullId) {
      const t = troopers[0];
      t.body.setScale(art(trooperArt(s, 0)).scale * VEHICLE_SCALE).setDepth(Depth.trooper + 0.2);
      t.hull = addArt(sc, hullId).setDepth(Depth.trooper);
      t.hull.setScale(t.hull.scale * VEHICLE_SCALE);
      t.shadow.setDisplaySize(70, 56);
    }
    let hero: SquadView['hero'];
    if (s.hero) {
      const t = troopers[0];
      t.body.setScale(t.body.scale * HERO_SCALE);
      t.shadow.setDisplaySize(36, 36);
      hero = {
        ring: sc.add.image(0, 0, 'fx.ring').setTint(0xf2c14a).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.decal).setDisplaySize(52, 52),
        tag: sc.add.text(0, 0, '', { fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '11px', fontStyle: '900', color: '#f2c14a', stroke: '#000', strokeThickness: 3, resolution: 3 }).setOrigin(0.5).setDepth(Depth.bars),
        bubble: sc.add.image(0, 0, 'fx.shieldBubble').setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.shield).setDisplaySize(64, 64).setVisible(false),
      };
    }
    return {
      hero,
      squad: s,
      troopers,
      turrets: [],
      arc: sc.add.graphics().setDepth(Depth.arc),
      bars: sc.add.graphics().setDepth(Depth.bars),
      arcKey: '',
      barsKey: '',
      artKey: s.spec?.id ?? '',
    };
  }

  /** Swap trooper sprites after a specialization, and add/remove turret sprites. */
  private syncSquadArt(v: SquadView): void {
    const s = v.squad;
    const key = s.spec?.id ?? '';
    if (key !== v.artKey) {
      v.artKey = key;
      const vehicle = !!(s.spec?.vehicleHull ?? s.def.vehicleHull);
      v.troopers.forEach((t, i) => {
        const r = art(trooperArt(s, i));
        t.body.setTexture(r.key, r.frame).setOrigin(r.originX, r.originY).setScale(r.scale * (vehicle ? VEHICLE_SCALE : UNIT_DRAW_SCALE));
        t.rot = r.rotation;
        if (t.hull) {
          const h = art(s.spec?.vehicleHull ?? s.def.vehicleHull!);
          t.hull.setTexture(h.key, h.frame).setOrigin(h.originX, h.originY).setScale(h.scale * VEHICLE_SCALE);
        }
      });
    }
    while (v.turrets.length < s.turrets.length) {
      const body = addArt(this.scene, 'unit.turret').setDepth(Depth.trooper);
      body.setScale(body.scale * UNIT_DRAW_SCALE);
      v.turrets.push({ body, shadow: this.scene.add.image(0, 0, 'fx.shadow').setDisplaySize(30, 30).setDepth(Depth.shadow) });
      this.fx.ring(s.anchorX, s.anchorY, 6, 30, Palette.uiAmber, 0.3);
    }
    while (v.turrets.length > s.turrets.length) {
      const t = v.turrets.pop()!;
      t.body.destroy();
      t.shadow.destroy();
    }
  }

  private drawArc(v: SquadView): void {
    const s = v.squad;
    const range = this.world.rangeOf(s);
    const selected = this.selected === s;
    const aura = s.stats.aura;
    const key = `${s.facing.toFixed(3)}|${range}|${selected}|${s.down}|${s.x.toFixed(0)},${s.y.toFixed(0)}|${s.stats.arcDeg}|${aura?.radius}|${s.turrets.length}`;
    if (key === v.arcKey) return;
    v.arcKey = key;
    const g = v.arc.clear();
    if (s.down) return;
    if (aura) {
      g.fillStyle(0x7be08a, selected ? 0.08 : 0.04).fillCircle(s.x, s.y, aura.radius);
      g.lineStyle(1.5, 0x7be08a, selected ? 0.5 : 0.2).strokeCircle(s.x, s.y, aura.radius);
    }
    if (s.stats.detect) g.lineStyle(1, 0x9a7aff, selected ? 0.5 : 0.15).strokeCircle(s.x, s.y, s.stats.detect);
    if (selected && s.turrets.length) {
      const tr = this.world.turretRange(s);
      g.lineStyle(1, Palette.uiAmber, 0.35);
      for (const t of s.turrets) g.strokeCircle(t.x, t.y, tr);
    }
    const arcDeg = s.stats.arcDeg;
    if (arcDeg >= 360) {
      g.lineStyle(selected ? 2 : 1.2, Palette.fdcAccent, selected ? 0.55 : 0.18).strokeCircle(s.x, s.y, range);
      if (selected) g.fillStyle(Palette.fdcAccent, 0.06).fillCircle(s.x, s.y, range);
      return;
    }
    const half = (arcDeg * Math.PI) / 360;
    const a0 = s.facing - half, a1 = s.facing + half;
    g.fillStyle(Palette.fdcAccent, selected ? 0.11 : 0.045).slice(s.x, s.y, range, a0, a1).fillPath();
    g.lineStyle(selected ? 2 : 1.2, Palette.fdcAccent, selected ? 0.6 : 0.22);
    g.lineBetween(s.x, s.y, s.x + Math.cos(a0) * range, s.y + Math.sin(a0) * range);
    g.lineBetween(s.x, s.y, s.x + Math.cos(a1) * range, s.y + Math.sin(a1) * range);
    g.beginPath().arc(s.x, s.y, range, a0, a1).strokePath();
  }

  private drawHeroBars(v: SquadView): void {
    const s = v.squad, h = s.hero!;
    const t = s.troopers[0];
    const key = `${Math.round((t.hp / s.stats.hp) * 30)}|${Math.round(h.xp)}|${h.level}|${s.down ? Math.ceil(s.downTimer) : -1}|${s.x.toFixed(0)},${s.y.toFixed(0)}`;
    if (key === v.barsKey) return;
    v.barsKey = key;
    const g = v.bars.clear();
    if (s.down) {
      g.lineStyle(3, 0xf2c14a, 0.8).beginPath().arc(s.x, s.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - s.downTimer / 22)).strokePath();
      return;
    }
    const w = 40, x0 = s.x - w / 2, y = s.y + 26;
    const f = t.alive ? t.hp / s.stats.hp : 0;
    g.fillStyle(0x000000, 0.7).fillRect(x0 - 1, y - 1, w + 2, 9);
    g.fillStyle(f > 0.5 ? 0x7be08a : f > 0.25 ? 0xf2c14a : 0xff5a4a, 1).fillRect(x0, y, w * f, 4);
    const lo = h.level <= 1 ? 0 : HERO_LEVEL_XP[h.level - 2], hi = HERO_LEVEL_XP[h.level - 1];
    const xf = hi ? (h.xp - lo) / (hi - lo) : 1;
    g.fillStyle(0xf2c14a, 1).fillRect(x0, y + 5, w * Math.min(1, xf), 2);
  }

  private drawBars(v: SquadView): void {
    const s = v.squad;
    if (s.hero) return this.drawHeroBars(v);
    const max = s.stats.hp;
    let key = `${s.tier}|${s.rank}|${s.spec?.id}|${s.down ? Math.ceil(s.downTimer * 4) : -1}|${s.x.toFixed(0)},${s.y.toFixed(0)}|${Math.ceil(s.expires * 2)}`;
    for (const t of s.troopers) key += t.alive ? `|${Math.round((t.hp / max) * 8)}` : '|x';
    if (key === v.barsKey) return;
    v.barsKey = key;
    const g = v.bars.clear();
    const n = s.troopers.length;
    const w = 9, gap = 2;
    const x0 = s.x - (n * (w + gap) - gap) / 2, y = s.y + 26;
    if (s.down) {
      g.lineStyle(3, 0xff4a3a, 0.9);
      g.lineBetween(s.x - 8, s.y - 8, s.x + 8, s.y + 8).lineBetween(s.x + 8, s.y - 8, s.x - 8, s.y + 8);
      g.lineStyle(3, 0xffffff, 0.5).beginPath().arc(s.x, s.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - s.downTimer / Balance.downTime)).strokePath();
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = s.troopers[i];
      const x = x0 + i * (w + gap);
      g.fillStyle(0x000000, 0.65).fillRect(x - 1, y - 1, w + 2, 5);
      if (t.alive) {
        const f = t.hp / max;
        g.fillStyle(f > 0.5 ? 0x7be08a : f > 0.25 ? 0xf2c14a : 0xff5a4a, 1).fillRect(x, y, w * f, 3);
      }
    }
    if (s.expires > 0) {
      const tw = n * (w + gap) - gap;
      g.fillStyle(0x000000, 0.6).fillRect(x0 - 1, y + 5, tw + 2, 4);
      g.fillStyle(Palette.fdcAccent, 1).fillRect(x0, y + 6, tw * Math.min(1, s.expires / (this.world.powerDefs.droppod.duration ?? 30)), 2);
    }
    // Tier chevrons (filled cyan diamond once specialized), then veterancy stars.
    const marks = s.tier + 1 + (s.spec ? 1 : 0);
    const total = marks + s.rank;
    let cx = s.x - ((total - 1) * 9) / 2;
    const cy = y + 10;
    for (let i = 0; i <= s.tier; i++, cx += 9) g.fillStyle(Palette.uiAmber, 1).fillTriangle(cx - 3.5, cy + 2, cx, cy - 2, cx + 3.5, cy + 2);
    if (s.spec) {
      g.fillStyle(Palette.fdcAccent, 1).fillTriangle(cx, cy - 3.5, cx + 3.5, cy, cx, cy + 3.5).fillTriangle(cx, cy - 3.5, cx - 3.5, cy, cx, cy + 3.5);
      cx += 9;
    }
    for (let i = 0; i < s.rank; i++, cx += 9) this.star(g, cx, cy, 3.8, 0xffe066);
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
    }
    g.fillStyle(color, 1).fillPoints(pts, true);
  }

  private makeBuildingView(b: Building): BuildingView {
    const s = this.scene;
    const v: BuildingView = {
      b,
      shadow: s.add.image(b.x + 5, b.y + 7, 'fx.shadow').setDisplaySize(b.def.footprint * 3, b.def.footprint * 3).setDepth(Depth.shadow),
      body: addArt(s, b.def.art, b.x, b.y).setDepth(Depth.prop),
      glow: null,
      bars: s.add.graphics().setDepth(Depth.bars),
      tier: -1,
    };
    const r = art(b.def.art);
    v.body.setScale(((b.def.footprint * 2.2) / 64) * (r.scale / ART_SCALE) * ART_SCALE * 1);
    if (b.def.id === 'reactor') {
      v.glow = s.add.image(b.x, b.y, 'fx.light').setTint(Palette.fdcAccent).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.light).setDisplaySize(170, 170);
    }
    return v;
  }

  private updateBuilding(v: BuildingView): void {
    const b = v.b;
    if (v.glow) v.glow.setAlpha(0.18 + 0.06 * (b.tier + 1) + 0.05 * Math.sin(this.t * 3));
    if (b.def.id === 'reactor') v.body.setRotation(this.t * 0.15 * (b.tier + 1));
    if (b.def.id === 'sensor') v.body.setRotation(this.t * 1.6);
    const selected = this.selected === b;
    const key = b.tier * 10 + (selected ? 1 : 0);
    if (key === v.tier) return;
    v.tier = key;
    const g = v.bars.clear();
    for (let i = 0; i <= b.tier; i++) {
      const cx = b.x - (b.tier * 9) / 2 + i * 9, cy = b.y + b.def.footprint + 10;
      g.fillStyle(Palette.uiAmber, 1).fillTriangle(cx - 3.5, cy + 2, cx, cy - 2, cx + 3.5, cy + 2);
    }
    const detect = b.def.tiers[b.tier].detect;
    if (detect) {
      g.lineStyle(selected ? 2 : 1, 0x9a7aff, selected ? 0.6 : 0.18).strokeCircle(b.x, b.y, detect);
      if (selected) g.fillStyle(0x9a7aff, 0.06).fillCircle(b.x, b.y, detect);
    }
  }

  // ================================================================== frame update

  update(alpha: number, dt: number, placing: boolean): void {
    this.t += dt;
    this.mapView.update(dt, placing);

    for (const s of this.world.squads) {
      let v = this.squadViews.get(s);
      if (!v) {
        v = this.makeSquadView(s);
        this.squadViews.set(s, v);
      }
      this.syncSquadArt(v);
      this.drawArc(v);
      this.drawBars(v);
      for (let i = 0; i < s.troopers.length; i++) this.updateTrooper(v.troopers[i], s.troopers[i], s, alpha);
      if (v.hero && s.hero) {
        const t = s.troopers[0];
        const x = lerp(t.prevX, t.x, alpha), y = lerp(t.prevY, t.y, alpha);
        v.hero.ring.setVisible(!s.down).setPosition(x, y).setAlpha(0.45 + 0.25 * Math.sin(this.t * 3));
        v.hero.tag.setVisible(!s.down).setPosition(x, y - 30);
        if (v.hero.tag.text !== `LV ${s.hero.level}`) v.hero.tag.setText(`LV ${s.hero.level}`);
        v.hero.bubble.setVisible(!s.down && s.hero.shieldT > 0).setPosition(x, y).setAlpha(0.5 + 0.2 * Math.sin(this.t * 8));
        v.troopers[0].body.setAlpha(s.hero.cloakT > 0 ? 0.3 + 0.1 * Math.sin(this.t * 10) : 1);
      }
      for (let i = 0; i < v.turrets.length; i++) {
        const tv = v.turrets[i], tu = s.turrets[i];
        tv.body.setPosition(tu.x, tu.y).setRotation(tu.angle);
        tv.shadow.setPosition(tu.x + 3, tu.y + 4);
      }
    }

    for (const b of this.world.buildings) {
      let v = this.buildingViews.get(b);
      if (!v) {
        v = this.makeBuildingView(b);
        this.buildingViews.set(b, v);
      }
      this.updateBuilding(v);
    }

    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      const v = this.enemyViews.get(e);
      if (v) this.updateEnemy(v, e, alpha, dt);
    }

    // Mines: matched by index.
    const mines = this.world.mines;
    while (this.mineViews.length < mines.length) this.mineViews.push(addArt(this.scene, 'fx.mine').setDepth(Depth.decal + 0.5));
    for (let i = 0; i < this.mineViews.length; i++) {
      const m = mines[i];
      const img = this.mineViews[i];
      if (!m) {
        img.setVisible(false);
        continue;
      }
      img.setVisible(true).setPosition(m.x, m.y).setAlpha(m.arm > 0 ? 0.5 : Math.sin(this.t * 8 + i) > 0 ? 1 : 0.7);
    }

    // Shells/rockets: views are matched to the projectile list by index each frame.
    const shells = this.world.projectiles;
    while (this.shellViews.length < shells.length) {
      this.shellViews.push({
        shadow: this.scene.add.image(0, 0, 'fx.shadow').setDisplaySize(10, 8).setDepth(Depth.shadow),
        shell: addArt(this.scene, 'fx.shell').setDepth(Depth.shell),
        kind: 'shell',
      });
    }
    for (let i = 0; i < this.shellViews.length; i++) {
      const sv = this.shellViews[i];
      const p: Projectile | undefined = shells[i];
      if (!p) {
        sv.shell.setVisible(false);
        sv.shadow.setVisible(false);
        continue;
      }
      const x = lerp(p.prevX, p.x, alpha), y = lerp(p.prevY, p.y, alpha);
      const k = Math.min(1, (p.t + this.world.dt * alpha) / p.dur);
      const dir = Math.atan2(p.ty - p.y0, p.tx - p.x0);
      if (p.kind === 'rocket') {
        sv.shadow.setVisible(true).setPosition(x + 2, y + 3);
        sv.shell.setVisible(true).setPosition(x, y).setRotation(dir).setTint(0xff9a6a).setScale(art('fx.shell').scale * UNIT_DRAW_SCALE * 1.3);
        this.fx.rocketTrail(x, y, dir);
        continue;
      }
      const h = Math.sin(Math.PI * k) * Math.min(70, Math.hypot(p.tx - p.x0, p.ty - p.y0) * 0.3);
      sv.shadow.setVisible(true).setPosition(x, y);
      sv.shell.setVisible(true).clearTint().setPosition(x, y - h).setRotation(dir - (k - 0.5) * 1.2)
        .setScale(art('fx.shell').scale * UNIT_DRAW_SCALE * (1 + h / 60));
    }

    this.fx.update(dt);
  }

  private updateTrooper(v: TrooperView, t: Trooper, s: Squad, alpha: number): void {
    const visible = t.alive && !s.down;
    if (v.hull) {
      // Vehicles leave a smoking wreck while "down" (being rebuilt).
      const x = lerp(t.prevX, t.x, alpha), y = lerp(t.prevY, t.y, alpha);
      v.hull.setPosition(x, y).setRotation(s.facing).setTint(visible ? 0xffffff : 0x3a3430);
      v.shadow.setPosition(x + 5, y + 7).setVisible(true);
      v.body.setVisible(visible).setPosition(x, y).setRotation(t.angle + v.rot);
      if (!visible && Math.random() < 0.15) this.fx.puff('fx.smoke', x + (Math.random() - 0.5) * 16, y, 14, 30, 0, 0, 1.6, 0.4, 0x2e2b27, false, Depth.fx, 0.5, 18);
      if (!visible && Math.random() < 0.05) this.fx.puff('fx.fireball', x, y, 8, 16, 0, 0, 0.5, 0.8, FIRE_RAMP, true, Depth.fx, 0.5, 20);
      return;
    }
    v.body.setVisible(visible);
    v.shadow.setVisible(visible);
    if (!visible) return;
    const x = lerp(t.prevX, t.x, alpha), y = lerp(t.prevY, t.y, alpha);
    if (this.fx.high && Math.abs(t.x - t.prevX) + Math.abs(t.y - t.prevY) > 1.2 && Math.random() < 0.12) this.fx.dust.emitParticleAt(x, y + 4, 1);
    v.body.setPosition(x, y).setRotation(t.angle + v.rot);
    v.shadow.setPosition(x + 3, y + 4);
  }

  private updateEnemy(v: EnemyView, e: Enemy, alpha: number, dt: number): void {
    const x = lerp(e.prevX, e.x, alpha), y = lerp(e.prevY, e.y, alpha);
    const r = e.def.radius;
    const a = art(e.def.art);
    const stunned = e.stunT > 0;
    const big = r > 20;
    const wobble = stunned ? 0 : e.engaged ? Math.sin(this.t * 18 + e.id) * 0.25 : Math.sin(this.t * (big ? 3 : 10) + e.id) * (big ? 0.03 : 0.08);
    const def = e.def;
    if (def.flier) {
      // Fliers: higher up, so the shadow sits further away; a gentle bob.
      const bob = Math.sin(this.t * 2.4 + e.id) * 0.05;
      const hover = e.carrierState === 1;
      v.body.setPosition(x, y - 6).setRotation(e.heading + a.rotation + Math.sin(this.t * 1.7 + e.id) * 0.06);
      v.body.setScale(a.scale * (big ? 1.1 : UNIT_DRAW_SCALE) * (1 + bob));
      v.shadow.setPosition(x + 16, y + 26).setDisplaySize(r * 3.2, r * 2.4).setAlpha(0.45);
      v.aura.setVisible(hover);
      if (hover) {
        v.aura.setPosition(x, y + 8).setTint(0xff6ae0).setAlpha(0.4 + 0.3 * Math.sin(this.t * 12)).setDisplaySize(r * 2.2, r * 2.2);
        if (Math.random() < dt * 20) this.fx.dust.emitParticleAt(x + (Math.random() - 0.5) * r, y + 12, 1);
      }
    } else {
      v.body.setPosition(x, y).setRotation(e.heading + a.rotation + wobble);
      v.shadow.setPosition(x + 3, y + 5).setDisplaySize(r * 3, r * 2.6);
    }
    // Cloaked and unrevealed: just a faint shimmer, no bars.
    const hidden = !!def.cloaked && !e.revealed;
    v.body.setAlpha(hidden ? 0.1 + 0.08 * Math.sin(this.t * 9 + e.id) : 1);
    v.shadow.setVisible(!hidden);
    if (def.healAura) {
      const pulse = (this.t * 0.8 + e.id * 0.13) % 1;
      v.aura.setVisible(true).setPosition(x, y).setTint(0x9cff9c).setAlpha(0.35 * (1 - pulse))
        .setDisplaySize(def.healAura.radius * 2 * (0.3 + 0.7 * pulse), def.healAura.radius * 2 * (0.3 + 0.7 * pulse));
    }

    if (v.flash > 0) {
      v.flash -= dt;
      if (v.flash <= 0) v.body.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffffff);
    } else if (e.berserk) {
      v.body.setTint(Math.sin(this.t * 14) > 0 ? 0xff6050 : 0xffb0a0);
    } else if (e.slowT > 0) {
      v.body.setTint(0x9fd8ff);
    } else {
      v.body.setTint(0xffffff);
    }

    // Wounded aliens leave an ichor trail.
    if (this.fx.high && e.hp < e.maxHp * 0.5 && !stunned && Math.random() < dt * 3) {
      this.fx.decal('fx.splat', x, y, ART_SCALE * 0.35, 0xffffff, 6, 0.8);
    }
    // Burning: little flames.
    if (e.burnT > 0) {
      v.burnFx -= dt;
      if (v.burnFx <= 0) {
        v.burnFx = 0.12;
        this.fx.puff('fx.fireball', x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, 6 + Math.random() * 4, 14, 0, 0, 0.4, 0.9, FIRE_RAMP, true, Depth.fx, 0.1, 26);
      }
    }

    const maxShield = e.maxShield;
    if (maxShield > 0 && e.shield > 0) {
      v.shieldFlash = Math.max(0, v.shieldFlash - dt * 4);
      v.shield.setVisible(true).setPosition(x, y).setDisplaySize(r * 3.2, r * 3.2)
        .setAlpha(0.25 + 0.45 * (e.shield / maxShield) + v.shieldFlash * 0.5 + Math.sin(this.t * 6 + e.id) * 0.05);
    } else v.shield.setVisible(false);

    const hurt = !hidden && (e.hp < e.maxHp || (maxShield > 0 && e.shield < maxShield));
    const w = Math.max(18, r * 2.2);
    const by = y - r - 9;
    v.barBg.setVisible(hurt).setPosition(x - w / 2 - 1, by).setDisplaySize(w + 2, 5);
    v.barFill.setVisible(hurt).setPosition(x - w / 2, by).setDisplaySize(Math.max(0.01, w * (e.hp / e.maxHp)), 3)
      .setTint(e.berserk ? 0xff4a3a : 0xe0475f);
    v.shieldFill.setVisible(hurt && maxShield > 0 && e.shield > 0).setPosition(x - w / 2, by - 4)
      .setDisplaySize(Math.max(0.01, w * (e.shield / Math.max(1, maxShield))), 2);
    v.mark.setVisible(!hidden && e.markT > 0).setPosition(x, y).setRotation(this.t * 2);
    v.stun.setVisible(!hidden && stunned).setPosition(x, by - 8).setRotation(Math.sin(this.t * 8) * 0.2);
  }

  // ================================================================== sim events → juice

  enemySpawned(e: Enemy): void {
    const list = this.freeEnemyViews.get(e.def.art);
    const v = list?.pop() ?? this.makeEnemyView(e.def.art);
    v.hidden = false;
    v.flash = 0;
    v.shieldFlash = 0;
    v.body.setVisible(true).setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffffff).setAlpha(1)
      .setDepth(e.def.flier ? Depth.shield + 1 : e.def.radius > 20 ? Depth.enemy + 0.5 : Depth.enemy);
    v.shadow.setVisible(true).setAlpha(1);
    v.aura.setVisible(false);
    this.enemyViews.set(e, v);
    if (e.def.id === 'colossus') {
      this.onNotice?.('⚠ COLOSSUS STRIDER INBOUND');
      this.fx.shake(0.004, 600);
      sfx.roar();
    }
  }

  bargeUnload(b: Enemy): void {
    this.fx.ring(b.x, b.y + 8, 10, 70, 0xff6ae0, 0.5);
    this.fx.light(b.x, b.y, 200, 0xff6ae0, 0.6, 0.4);
    this.fx.dust.explode(18, b.x, b.y + 10);
    this.onNotice?.('Brood Barge unloading!');
    sfx.roar();
  }

  stomp(boss: Enemy, radius: number): void {
    this.fx.ring(boss.x, boss.y, radius * 0.3, radius * 1.2, 0xd8c0a0, 0.4);
    this.fx.dust.explode(26, boss.x, boss.y);
    this.fx.debris(boss.x, boss.y, 6, 'fx.chunk', radius * 3, 1.2);
    this.fx.decal('fx.scorch', boss.x, boss.y, ((radius * 1.4) / 64) * ART_SCALE, 0x8a7a60, 20, 0.35);
    this.fx.shake(0.008, 260);
    sfx.explosion();
  }

  bossPhase(boss: Enemy, phase: number): void {
    this.fx.debris(boss.x, boss.y, 10, 'fx.plate', 220, 1.8);
    this.fx.ring(boss.x, boss.y, 20, 140, 0xff4a3a, 0.5);
    this.fx.light(boss.x, boss.y, 300, Palette.choirCore, 0.7, 0.5);
    this.fx.shake(0.01, 400);
    this.onNotice?.(phase === 1 ? 'Colossus armor cracking!' : 'COLOSSUS ENRAGED!');
    sfx.roar();
  }

  healPulse(h: Enemy, t: Enemy): void {
    if (!this.fx.high) return;
    this.fx.tracer(h.x, h.y, t.x, t.y, false, 0x9cff9c, 30, 2, 500);
    this.fx.flash('fx.mf.plasma', t.x, t.y, 0, 8 / 64, 16 / 64, 0.2, 0x9cff9c, 0.7, Depth.fx);
  }

  private releaseEnemy(e: Enemy): void {
    const v = this.enemyViews.get(e);
    if (!v) return;
    this.enemyViews.delete(e);
    this.hideEnemyView(v);
    let list = this.freeEnemyViews.get(e.def.art);
    if (!list) this.freeEnemyViews.set(e.def.art, (list = []));
    list.push(v);
  }

  shot(s: Squad, t: Trooper, toX: number, toY: number, hit: boolean): void {
    const idx = s.troopers.indexOf(t);
    const turretId = trooperArt(s, 0);
    if (VEHICLE_FX[turretId]) {
      const style = VEHICLE_FX[turretId];
      const m = this.fireFx(s, t);
      this.fx.tracer(m.x, m.y, toX, toY, false, style.tracerColor, style.tracerLen, style.tracerWidth, style.tracerSpeed);
      if (hit) this.fx.sparks.explode(4, toX, toY);
      else this.fx.groundHit(toX, toY);
      if (turretId === 'veh.walker.turret') sfx.gatling();
      else sfx.autocannon();
      return;
    }
    const kind = weaponOf(trooperArt(s, Math.max(0, idx)));
    const style = WEAPON_FX[kind];
    const m = this.fireFx(s, t);
    this.fx.tracer(m.x, m.y, toX, toY, false, style.tracerColor, style.tracerLen, style.tracerWidth, style.tracerSpeed);
    if (hit) {
      this.fx.sparks.explode(kind === 'amr' || kind === 'sniper' ? 6 : 2, toX, toY);
      if (Math.random() < 0.35) this.fx.gore.explode(2, toX, toY);
    } else this.fx.groundHit(toX, toY);
    if (kind === 'sniper' || kind === 'amr') sfx.sniper();
    else if (kind === 'gatling') sfx.gatling();
    else if (kind === 'shotgun') sfx.shotgun();
    else sfx.rifle();
  }

  turretShot(_s: Squad, tu: Turret, toX: number, toY: number): void {
    // Twin barrels fire alternately.
    this.shotCount++;
    const side = this.shotCount % 2 ? -1.5 : 1.5;
    const c = Math.cos(tu.angle), sn = Math.sin(tu.angle);
    const mx = tu.x + c * 21 - sn * side * UNIT_DRAW_SCALE, my = tu.y + sn * 21 + c * side * UNIT_DRAW_SCALE;
    this.muzzleFlash(mx, my, tu.angle, TURRET_FX);
    this.fx.tracer(mx, my, toX, toY, false, TURRET_FX.tracerColor, 28, 1.3, 1800);
    if (this.shotCount % 2 === 0) this.fx.casing(tu.x, tu.y, tu.angle, 'small');
    sfx.turret();
  }

  shellFired(s: Squad, t: Trooper, p: Projectile): void {
    if (p.kind === 'rocket') {
      const m = this.fireFx(s, t);
      // Back-blast out of the rear of the tube.
      const pts = WEAPON_POINTS.rocket;
      const b = this.soldierPoint(t, pts.eject[0], pts.eject[1], this.tmpE);
      const back = t.angle + Math.PI;
      this.fx.flash('fx.mf.backblast', b.x, b.y, back, 40 / 128, 52 / 128, 0.12, 0xffc890, 0.9, Depth.muzzle, FLASH_ORIGIN['fx.mf.backblast']);
      for (let i = 0; i < 5; i++) {
        const a = back + (Math.random() - 0.5) * 0.9;
        const sp = 60 + Math.random() * 80;
        this.fx.puff('fx.smoke', b.x, b.y, 10, 36, Math.cos(a) * sp, Math.sin(a) * sp, 1.2 + Math.random() * 0.6, 0.45, 0xc8c2b8, false, Depth.fx, 0.08, 4);
      }
      this.fx.dust.explode(4, b.x, b.y);
      void m;
      sfx.rocket();
    } else if (s.stats.grenade && p.stun > 0) {
      // Thrown breach charge: no muzzle flash, just a little toss.
      sfx.melee();
    } else {
      this.fireFx(s, t);
      if (VEHICLE_FX[trooperArt(s, 0)]) sfx.cannon();
      else sfx.launcher();
    }
  }

  flame(s: Squad, t: Trooper, angle: number, range: number, arcDeg: number): void {
    // The flamer nozzle sits under the shotgun barrel.
    const n = this.soldierPoint(t, 29, 20.2, this.tmpP);
    void s;
    this.fx.flameStream(n.x, n.y, angle, range, arcDeg);
    this.fx.light(n.x + Math.cos(angle) * range * 0.5, n.y + Math.sin(angle) * range * 0.5, range * 2.6, 0xff8a3a, 0.55, 0.45);
    sfx.flame();
  }

  explosion(x: number, y: number, radius: number, kind: 'shell' | 'rocket'): void {
    this.fx.explosion(x, y, radius, kind === 'rocket');
    this.fx.shake(kind === 'rocket' ? 0.004 : 0.0025, kind === 'rocket' ? 160 : 110);
    sfx.explosion();
  }

  enemyDamaged(e: Enemy, amount: number, shieldHit: boolean): void {
    const v = this.enemyViews.get(e);
    if (v) {
      if (shieldHit) {
        v.shieldFlash = 1;
        const a = Math.random() * Math.PI * 2, r = e.def.radius * 1.5;
        this.fx.flash('fx.hexring', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, a, ART_SCALE * 0.5, ART_SCALE * 0.9, 0.18, Palette.shield, 0.9, Depth.shield);
        sfx.shieldHit();
      } else if (amount >= 1) {
        v.flash = 0.06;
        v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      }
    }
    this.fx.damage(e.x, e.y - e.def.radius, amount, shieldHit);
  }

  shieldBroken(e: Enemy): void {
    this.fx.shards.explode(16, e.x, e.y);
    this.fx.ring(e.x, e.y, e.def.radius, e.def.radius * 3, Palette.shield, 0.3);
    this.fx.light(e.x, e.y, 120, Palette.shield, 0.6, 0.2);
    this.fx.number(e.x, e.y - 26, 'SHIELD DOWN', Palette.shield);
    sfx.shieldBreak();
  }

  enemyKilled(e: Enemy, bounty: number): void {
    const id = e.def.id;
    if (id === 'ironback') {
      this.fx.debris(e.x, e.y, 7, 'fx.plate', 160, 1.4);
      this.fx.debris(e.x, e.y, 8, 'fx.gib', 190, 1.4);
      this.fx.gore.explode(30, e.x, e.y);
      this.fx.dust.explode(14, e.x, e.y);
      this.fx.decal('fx.splat', e.x, e.y, ART_SCALE * 2.6, 0xffffff, 26);
      this.fx.light(e.x, e.y, 200, Palette.choirCore, 0.55, 0.35);
      this.fx.shake(0.005, 200);
      sfx.roar();
    } else if (id === 'warden') {
      this.fx.ring(e.x, e.y, 30, 4, 0xff6ae0, 0.25); // implode
      this.fx.ring(e.x, e.y, 6, 46, Palette.shield, 0.35);
      this.fx.light(e.x, e.y, 170, 0xff6ae0, 0.6, 0.3);
      this.fx.shards.explode(12, e.x, e.y);
      this.fx.debris(e.x, e.y, 5, 'fx.gib', 160, 1.2);
      this.fx.gore.explode(14, e.x, e.y);
      this.fx.decal('fx.splat', e.x, e.y, ART_SCALE * 1.5, 0xffffff, 22);
    } else {
      this.fx.gore.explode(10, e.x, e.y);
      this.fx.debris(e.x, e.y, 3, 'fx.gib', 130, 0.9);
      this.fx.decal('fx.splat', e.x, e.y, ART_SCALE * 1.1, 0xffffff, 20);
    }
    this.fx.number(e.x, e.y - 18, `+${bounty}`, Palette.uiAmber);
    this.releaseEnemy(e);
    sfx.squish();
    sfx.coin();
  }

  enemyLeaked(e: Enemy): void {
    this.releaseEnemy(e);
    this.fx.light(e.x, e.y, 260, 0xff3030, 0.6, 0.5);
    this.fx.shake(0.006, 200);
    this.onIntegrityHit?.();
    sfx.alarm();
  }

  enemyBerserk(e: Enemy): void {
    this.fx.number(e.x, e.y - 30, 'BERSERK!', 0xff5a4a, true);
    this.fx.ring(e.x, e.y, 10, 50, 0xff4a3a, 0.35);
    sfx.roar();
  }

  enemyShot(e: Enemy, _s: Squad, t: Trooper): void {
    const a = Math.atan2(t.y - e.y, t.x - e.x);
    const x0 = e.x + Math.cos(a) * e.def.radius, y0 = e.y + Math.sin(a) * e.def.radius;
    this.fx.flash('fx.mf.plasma', x0, y0, 0, 14 / 64, 24 / 64, 0.12, 0xffffff, 1, Depth.muzzle);
    this.fx.tracer(x0, y0, t.x, t.y, true);
    this.fx.light(x0, y0, 70, 0xff4fd8, 0.5, 0.1);
    this.fx.flash('fx.mf.plasma', t.x, t.y, 0, 10 / 64, 20 / 64, 0.15, 0xffffff, 0.8, Depth.muzzle);
    this.fx.sparks.explode(3, t.x, t.y);
    sfx.plasma();
  }

  enemyMelee(_e: Enemy, _s: Squad, t: Trooper): void {
    this.fx.sparks.explode(3, t.x, t.y);
    sfx.melee();
  }

  trooperLost(s: Squad, t: Trooper): void {
    this.fx.dust.explode(6, t.x, t.y);
    this.fx.decal('fx.splat', t.x, t.y, ART_SCALE * 0.7, 0x8a1a1a, 12);
    // A fallen marine stays on the ground for a while.
    const r = art(trooperArt(s, Math.max(0, s.troopers.indexOf(t))));
    this.fx.decal(r.key, t.x, t.y, r.scale * UNIT_DRAW_SCALE, 0x5a4a48, 14, 0.85);
    sfx.trooperDown();
  }

  trooperRestored(_s: Squad, t: Trooper): void {
    this.fx.ring(t.x, t.y, 4, 16, 0x7be08a, 0.3);
  }

  squadDown(s: Squad): void {
    this.fx.dust.explode(14, s.x, s.y);
    this.fx.number(s.x, s.y - 28, 'SQUAD DOWN', 0xff5a4a, true);
  }

  squadRestored(s: Squad, revived: boolean): void {
    this.fx.ring(s.x, s.y, 10, revived ? 70 : 40, 0x7be08a, 0.4);
    this.fx.number(s.x, s.y - 28, revived ? 'REVIVED!' : 'BACK IN ACTION', 0x7be08a, revived);
  }

  squadPlaced(s: Squad): void {
    this.fx.dust.explode(10, s.x, s.y);
    this.fx.ring(s.x, s.y, 10, 44, Palette.fdcAccent, 0.35);
    sfx.place();
  }

  squadUpgraded(s: Squad): void {
    this.fx.ring(s.x, s.y, 12, 52, Palette.uiAmber, 0.45);
    this.fx.number(s.x, s.y - 30, `TIER ${['I', 'II', 'III'][s.tier]}`, Palette.uiAmber, true);
    sfx.upgrade();
  }

  squadSpecialized(s: Squad): void {
    this.fx.ring(s.x, s.y, 12, 70, Palette.fdcAccent, 0.5);
    this.fx.light(s.x, s.y, 200, Palette.fdcAccent, 0.5, 0.4);
    this.fx.number(s.x, s.y - 32, s.spec!.name.toUpperCase(), Palette.fdcAccent, true);
    sfx.upgrade();
  }

  abilityBought(s: Squad, name: string): void {
    this.fx.ring(s.x, s.y, 12, 56, Palette.fdcAccent, 0.4);
    this.fx.number(s.x, s.y - 32, name.toUpperCase(), Palette.fdcAccent, true);
    sfx.upgrade();
  }

  squadPromoted(s: Squad): void {
    this.fx.ring(s.x, s.y, 8, 48, 0xffe066, 0.45);
    this.fx.number(s.x, s.y - 36, `VETERAN ${'★'.repeat(s.rank)}`, 0xffe066, true);
    sfx.promote();
  }

  heroLevel(s: Squad): void {
    this.fx.ring(s.x, s.y, 10, 70, 0xf2c14a, 0.6);
    this.fx.light(s.x, s.y, 180, 0xf2c14a, 0.6, 0.5);
    this.fx.embers.explode(14, s.x, s.y);
    this.fx.number(s.x, s.y - 40, `LEVEL ${s.hero!.level}!`, 0xf2c14a, true);
    sfx.promote();
  }

  heroAbility(s: Squad, kind: string): void {
    const h = s.hero!;
    const a = h.def.abilities.find((q) => q.kind === kind)!;
    switch (kind) {
      case 'rally':
        this.fx.ring(s.x, s.y, 20, a.radius, 0xf2c14a, 0.6);
        this.fx.light(s.x, s.y, a.radius * 2, 0xf2c14a, 0.4, 0.6);
        sfx.waveHorn();
        break;
      case 'scan':
        this.fx.ring(s.x, s.y, 10, a.radius, 0x9a7aff, 0.8);
        this.fx.ring(s.x, s.y, 10, a.radius * 0.6, 0x9a7aff, 0.5);
        sfx.lockOn();
        break;
      case 'shieldwall':
        this.fx.ring(s.x, s.y, 40, 20, Palette.shield, 0.3);
        sfx.shieldBreak();
        break;
      case 'slam':
        this.fx.ring(s.x, s.y, 10, a.radius * 1.2, 0xd8c0a0, 0.45);
        this.fx.dust.explode(26, s.x, s.y);
        this.fx.debris(s.x, s.y, 6, 'fx.chunk', a.radius * 3, 1);
        this.fx.shake(0.008, 220);
        sfx.explosion();
        break;
      case 'cloak':
        this.fx.shards.explode(14, s.x, s.y);
        this.fx.ring(s.x, s.y, 30, 6, 0x47e0ff, 0.3);
        sfx.empCharge();
        break;
      case 'mines':
        this.fx.number(s.x, s.y - 30, 'MINES LAID', 0xff8a3a);
        sfx.place();
        break;
    }
    this.fx.number(s.x, s.y - 44, a.name.toUpperCase(), 0xf2c14a, true);
  }

  squadRemoved(s: Squad, refund: number): void {
    const v = this.squadViews.get(s);
    if (v) {
      for (const t of v.troopers) {
        t.body.destroy();
        t.shadow.destroy();
      }
      for (const t of v.turrets) {
        t.body.destroy();
        t.shadow.destroy();
      }
      v.arc.destroy();
      v.bars.destroy();
      this.squadViews.delete(s);
    }
    this.fx.dust.explode(10, s.x, s.y);
    if (s.expires !== 0 || refund > 0) {
      this.fx.number(s.x, s.y - 20, refund > 0 ? `+${refund}` : 'EXTRACTED', refund > 0 ? Palette.uiAmber : Palette.fdcAccent, true);
    }
    if (refund > 0) sfx.sell();
  }

  // ================================================================== commander powers

  powerUsed(id: string, x: number, y: number, x2: number, y2: number, delay: number): void {
    if (id === 'orbital') {
      const r = this.world.powerDefs.orbital.radius;
      this.fx.ring(x, y, r * 2, r * 0.6, 0xff3a3a, delay);
      this.fx.ring(x, y, r * 1.2, r, 0xff3a3a, delay * 0.6);
      this.fx.flash('fx.light', x, y, 0, 0.2, 0.6, delay, 0xff3030, 0.5, Depth.light);
      sfx.lockOn();
    } else if (id === 'airstrike') {
      const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const total = delay + (this.world.powerDefs.airstrike.bombs ?? 6) * 0.08 + 0.3;
      // The jet's shadow sweeps in from off-screen, across the line and out the far side.
      this.fx.mover('fx.jet', x - ux * 500, y - uy * 500, x2 + ux * 300, y2 + uy * 300, total, ART_SCALE * 2.2, 0x000000, 0.35, false, Depth.light);
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        this.fx.flash('fx.hexring', x + dx * k, y + dy * k, 0, ART_SCALE * 0.4, ART_SCALE * 0.6, delay, 0xff8a3a, 0.5, Depth.decal);
      }
      sfx.jet();
    } else if (id === 'emp') {
      this.fx.flash('fx.light', x, y, 0, 0.1, 0.5, delay, 0x6fc8ff, 0.7, Depth.light);
      sfx.empCharge();
    } else if (id === 'droppod') {
      this.fx.mover('fx.pod', x - 80, y - 320, x, y, delay, ART_SCALE * 1.6, 0xffffff, 1, false, Depth.light + 1);
      this.fx.flash('fx.shadow', x + 4, y + 6, 0, 0.3, 1.2, delay, 0x000000, 0.6, Depth.shadow);
      this.fx.flash('fx.light', x, y, 0, 0.2, 0.5, delay, 0xff8a3a, 0.4, Depth.light);
      sfx.podIncoming();
    }
  }

  orbitalImpact(x: number, y: number, r: number): void {
    this.fx.flash('fx.light', x, y, 0, (r * 6) / 256, (r * 8) / 256, 0.35, 0xffffff, 1, Depth.light);
    this.fx.flash('fx.mf.plasma', x, y, 0, (r * 1.6) / 64, (r * 2.4) / 64, 0.4, 0xff6060, 1, Depth.light);
    this.fx.explosion(x, y, r * 1.2, true);
    this.fx.ring(x, y, r * 0.5, r * 2.4, 0xffc0a0, 0.45);
    this.fx.embers.explode(40, x, y);
    this.fx.decal('fx.scorch', x, y, ((r * 2.2) / 64) * ART_SCALE, 0xffffff, 40, 0.5);
    this.fx.shake(0.016, 500);
    sfx.orbital();
  }

  bomb(x: number, y: number, r: number): void {
    this.fx.explosion(x, y, r, false);
    this.fx.shake(0.004, 120);
    sfx.explosion();
  }

  emp(x: number, y: number, r: number): void {
    this.fx.ring(x, y, 10, r * 1.1, 0x6fc8ff, 0.5);
    this.fx.ring(x, y, 10, r * 0.7, 0xffffff, 0.3);
    this.fx.light(x, y, r * 4, 0x6fc8ff, 0.7, 0.4);
    this.fx.shards.explode(30, x, y);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = r * (0.3 + Math.random() * 0.7);
      this.fx.tracer(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, false, 0x9fe8ff, d, 2, 2500);
    }
    this.fx.shake(0.006, 250);
    sfx.emp();
  }

  podLanded(s: Squad): void {
    this.fx.explosion(s.x, s.y, 30, false);
    this.fx.ring(s.x, s.y, 10, 70, Palette.fdcAccent, 0.4);
    this.fx.dust.explode(20, s.x, s.y);
    this.fx.number(s.x, s.y - 30, 'REINFORCEMENTS', Palette.fdcAccent, true);
    this.fx.shake(0.006, 200);
    sfx.place();
  }

  buildingPlaced(b: Building): void {
    this.fx.dust.explode(14, b.x, b.y);
    this.fx.ring(b.x, b.y, 10, 50, Palette.uiAmber, 0.35);
    sfx.place();
  }

  buildingUpgraded(b: Building): void {
    this.fx.ring(b.x, b.y, 12, 56, Palette.uiAmber, 0.45);
    this.fx.number(b.x, b.y - 34, `TIER ${['I', 'II', 'III'][b.tier]}`, Palette.uiAmber, true);
    sfx.upgrade();
  }

  buildingRemoved(b: Building, refund: number): void {
    const v = this.buildingViews.get(b);
    if (v) {
      v.body.destroy();
      v.shadow.destroy();
      v.glow?.destroy();
      v.bars.destroy();
      this.buildingViews.delete(b);
    }
    this.fx.dust.explode(12, b.x, b.y);
    this.fx.number(b.x, b.y - 20, `+${refund}`, Palette.uiAmber, true);
    sfx.sell();
  }

  income(b: Building, amount: number): void {
    this.fx.number(b.x, b.y - 30, `+${amount}`, Palette.uiAmber, true);
    this.fx.ring(b.x, b.y, 8, 40, Palette.uiAmber, 0.4);
    sfx.coin();
  }

  techChanged(tech: number): void {
    this.onNotice?.(`TECH ${tech} ONLINE`);
    sfx.cleared();
  }

  waveStarted(): void {
    sfx.waveHorn();
  }

  waveCleared(): void {
    sfx.cleared();
  }

  gameOver(won: boolean): void {
    if (won) sfx.victory();
    else sfx.defeat();
  }
}
