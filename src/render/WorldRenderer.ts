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
import { Effects } from './Effects';
import { MapView } from './MapView';

/** Units are drawn a bit larger than their simulation size so they read well on small screens. */
export const UNIT_DRAW_SCALE = 1.4;

type Img = Phaser.GameObjects.Image;

interface TrooperView {
  body: Img;
  shadow: Img;
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
  }

  // ================================================================== views

  private makeEnemyView(artId: string): EnemyView {
    const s = this.scene;
    const v: EnemyView = {
      shadow: s.add.image(0, 0, 'fx.shadow').setDepth(Depth.shadow),
      body: addArt(s, artId).setDepth(Depth.enemy).setScale(art(artId).scale * UNIT_DRAW_SCALE),
      shield: s.add.image(0, 0, 'fx.shieldBubble').setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.shield),
      barBg: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setTint(0x000000).setAlpha(0.7).setDepth(Depth.bars),
      barFill: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setDepth(Depth.bars),
      shieldFill: s.add.image(0, 0, 'ui.white').setOrigin(0, 0.5).setTint(Palette.shield).setDepth(Depth.bars),
      mark: addArt(s, 'fx.mark').setDepth(Depth.bars).setScale(ART_SCALE * 0.9),
      stun: addArt(s, 'fx.stun').setDepth(Depth.bars),
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
    for (const o of [v.body, v.shadow, v.shield, v.barBg, v.barFill, v.shieldFill, v.mark, v.stun]) o.setVisible(false);
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
    return {
      squad: s,
      troopers: s.troopers.map((_, i) => this.makeTrooperView(trooperArt(s, i))),
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
      v.troopers.forEach((t, i) => {
        const r = art(trooperArt(s, i));
        t.body.setTexture(r.key, r.frame).setOrigin(r.originX, r.originY).setScale(r.scale * UNIT_DRAW_SCALE);
        t.rot = r.rotation;
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

  private drawBars(v: SquadView): void {
    const s = v.squad;
    const max = s.stats.hp;
    let key = `${s.tier}|${s.rank}|${s.spec?.id}|${s.down ? Math.ceil(s.downTimer * 4) : -1}|${s.x.toFixed(0)},${s.y.toFixed(0)}`;
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
    const selected = this.selected === b;
    const key = b.tier * 10 + (selected ? 1 : 0);
    if (key === v.tier) return;
    v.tier = key;
    const g = v.bars.clear();
    for (let i = 0; i <= b.tier; i++) {
      const cx = b.x - (b.tier * 9) / 2 + i * 9, cy = b.y + b.def.footprint + 10;
      g.fillStyle(Palette.uiAmber, 1).fillTriangle(cx - 3.5, cy + 2, cx, cy - 2, cx + 3.5, cy + 2);
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
        if (Math.random() < 0.6) this.fx.smoke.emitParticleAt(x - Math.cos(dir) * 6, y - Math.sin(dir) * 6, 1);
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
    v.body.setVisible(visible);
    v.shadow.setVisible(visible);
    if (!visible) return;
    const x = lerp(t.prevX, t.x, alpha), y = lerp(t.prevY, t.y, alpha);
    v.body.setPosition(x, y).setRotation(t.angle + v.rot);
    v.shadow.setPosition(x + 3, y + 4);
  }

  private updateEnemy(v: EnemyView, e: Enemy, alpha: number, dt: number): void {
    const x = lerp(e.prevX, e.x, alpha), y = lerp(e.prevY, e.y, alpha);
    const r = e.def.radius;
    const a = art(e.def.art);
    const stunned = e.stunT > 0;
    const wobble = stunned ? 0 : e.engaged ? Math.sin(this.t * 18 + e.id) * 0.25 : Math.sin(this.t * 10 + e.id) * 0.08;
    v.body.setPosition(x, y).setRotation(e.heading + a.rotation + wobble);
    v.shadow.setPosition(x + 3, y + 5).setDisplaySize(r * 3, r * 2.6);

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

    // Burning: little flames.
    if (e.burnT > 0) {
      v.burnFx -= dt;
      if (v.burnFx <= 0) {
        v.burnFx = 0.12;
        this.fx.fire.emitParticleAt(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, 1);
      }
    }

    const maxShield = e.def.shield;
    if (maxShield > 0 && e.shield > 0) {
      v.shieldFlash = Math.max(0, v.shieldFlash - dt * 4);
      v.shield.setVisible(true).setPosition(x, y).setDisplaySize(r * 3.2, r * 3.2)
        .setAlpha(0.25 + 0.45 * (e.shield / maxShield) + v.shieldFlash * 0.5 + Math.sin(this.t * 6 + e.id) * 0.05);
    } else v.shield.setVisible(false);

    const hurt = e.hp < e.maxHp || (maxShield > 0 && e.shield < maxShield);
    const w = Math.max(18, r * 2.2);
    const by = y - r - 9;
    v.barBg.setVisible(hurt).setPosition(x - w / 2 - 1, by).setDisplaySize(w + 2, 5);
    v.barFill.setVisible(hurt).setPosition(x - w / 2, by).setDisplaySize(Math.max(0.01, w * (e.hp / e.maxHp)), 3)
      .setTint(e.berserk ? 0xff4a3a : 0xe0475f);
    v.shieldFill.setVisible(hurt && maxShield > 0 && e.shield > 0).setPosition(x - w / 2, by - 4)
      .setDisplaySize(Math.max(0.01, w * (e.shield / Math.max(1, maxShield))), 2);
    v.mark.setVisible(e.markT > 0).setPosition(x, y).setRotation(this.t * 2);
    v.stun.setVisible(stunned).setPosition(x, by - 8).setRotation(Math.sin(this.t * 8) * 0.2);
  }

  // ================================================================== sim events → juice

  enemySpawned(e: Enemy): void {
    const list = this.freeEnemyViews.get(e.def.art);
    const v = list?.pop() ?? this.makeEnemyView(e.def.art);
    v.hidden = false;
    v.flash = 0;
    v.shieldFlash = 0;
    v.body.setVisible(true).setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xffffff);
    v.shadow.setVisible(true);
    this.enemyViews.set(e, v);
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
    const reach = s.def.crewServed ? 22 : 18;
    const mx = t.x + Math.cos(t.angle) * reach, my = t.y + Math.sin(t.angle) * reach;
    const big = s.stats.damage >= 30;
    this.fx.flash('fx.muzzle', mx, my, t.angle, ART_SCALE * (big ? 1.4 : 0.9), ART_SCALE * (big ? 2 : 1.2), big ? 0.08 : 0.05, 0xffffff, 1, Depth.muzzle, 0);
    this.fx.light(mx, my, big ? 110 : 60, 0xffd890, big ? 0.5 : 0.35, 0.06);
    this.fx.tracer(mx, my, toX, toY);
    if (hit) this.fx.sparks.explode(big ? 5 : 2, toX, toY);
    if (big) {
      this.fx.shake(0.0015, 60);
      sfx.sniper();
    } else sfx.rifle();
  }

  turretShot(_s: Squad, tu: Turret, toX: number, toY: number): void {
    const mx = tu.x + Math.cos(tu.angle) * 16, my = tu.y + Math.sin(tu.angle) * 16;
    this.fx.flash('fx.muzzle', mx, my, tu.angle, ART_SCALE * 0.8, ART_SCALE * 1.1, 0.04, 0xffffff, 1, Depth.muzzle, 0);
    this.fx.tracer(mx, my, toX, toY);
    sfx.turret();
  }

  shellFired(_s: Squad, t: Trooper, p: Projectile): void {
    const mx = t.x + Math.cos(t.angle) * 20, my = t.y + Math.sin(t.angle) * 20;
    this.fx.flash('fx.muzzle', mx, my, t.angle, ART_SCALE * 1.3, ART_SCALE * 1.8, 0.08, 0xffd0a0, 1, Depth.muzzle, 0);
    this.fx.smoke.explode(3, mx, my);
    if (p.kind === 'rocket') {
      // Back-blast.
      this.fx.smoke.explode(5, t.x - Math.cos(t.angle) * 14, t.y - Math.sin(t.angle) * 14);
      sfx.rocket();
    } else sfx.launcher();
  }

  flame(_s: Squad, t: Trooper, angle: number, range: number, arcDeg: number): void {
    const half = (arcDeg * Math.PI) / 360;
    for (let i = 0; i < 26; i++) {
      const a = angle + (Math.random() * 2 - 1) * half;
      const d = Math.random() * range;
      this.fx.fire.emitParticleAt(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, 1);
    }
    this.fx.light(t.x + Math.cos(angle) * range * 0.5, t.y + Math.sin(angle) * range * 0.5, range * 2.2, 0xff8a3a, 0.5, 0.35);
    sfx.flame();
  }

  explosion(x: number, y: number, radius: number): void {
    this.fx.explosion(x, y, radius);
    this.fx.shake(0.0025, 110);
    sfx.explosion();
  }

  enemyDamaged(e: Enemy, amount: number, shieldHit: boolean): void {
    const v = this.enemyViews.get(e);
    if (v) {
      if (shieldHit) {
        v.shieldFlash = 1;
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
    const big = e.def.radius > 14;
    this.fx.gore.explode(big ? 26 : 10, e.x, e.y);
    this.fx.decal('fx.splat', e.x, e.y, ART_SCALE * (big ? 2.2 : 1.1), 0xffffff, 20);
    if (big) {
      this.fx.shake(0.004, 160);
      this.fx.light(e.x, e.y, 160, Palette.choirCore, 0.5, 0.3);
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
    this.fx.tracer(x0, y0, t.x, t.y, true);
    this.fx.light(x0, y0, 50, 0xff4fd8, 0.4, 0.08);
    this.fx.sparks.explode(2, t.x, t.y);
    sfx.plasma();
  }

  enemyMelee(_e: Enemy, _s: Squad, t: Trooper): void {
    this.fx.sparks.explode(3, t.x, t.y);
    sfx.melee();
  }

  trooperLost(_s: Squad, t: Trooper): void {
    this.fx.dust.explode(5, t.x, t.y);
    this.fx.decal('fx.splat', t.x, t.y, ART_SCALE * 0.6, 0x8a1a1a, 12);
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
    this.fx.number(s.x, s.y - 20, `+${refund}`, Palette.uiAmber, true);
    sfx.sell();
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
