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
import type { Enemy, Projectile, Squad, Trooper } from '../sim/entities';
import type { SimEvents } from '../sim/events';
import type { World } from '../sim/World';
import { Depth } from './depth';
import { Effects } from './Effects';
import { MapView } from './MapView';

/** Units are drawn a bit larger than their simulation size so they read well on small screens. */
export const UNIT_DRAW_SCALE = 1.25;

type Img = Phaser.GameObjects.Image;

interface TrooperView {
  body: Img;
  shadow: Img;
  /** Art rotation offset (sprites drawn facing up instead of right, etc.). */
  rot: number;
}

interface SquadView {
  squad: Squad;
  troopers: TrooperView[];
  arc: Phaser.GameObjects.Graphics;
  bars: Phaser.GameObjects.Graphics;
  arcKey: string;
  barsKey: string;
}

interface EnemyView {
  body: Img;
  shadow: Img;
  shield: Img;
  barBg: Img;
  barFill: Img;
  shieldFill: Img;
  flash: number;
  shieldFlash: number;
  hidden: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class WorldRenderer implements SimEvents {
  readonly fx: Effects;
  readonly mapView: MapView;
  private squadViews = new Map<Squad, SquadView>();
  private enemyViews = new Map<Enemy, EnemyView>();
  private freeEnemyViews = new Map<string, EnemyView[]>();
  private shellViews: { shell: Img; shadow: Img }[] = [];
  private t = 0;
  selected: Squad | null = null;
  onIntegrityHit?: () => void;

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
      flash: 0,
      shieldFlash: 0,
      hidden: false,
    };
    this.hideEnemyView(v);
    return v;
  }

  private hideEnemyView(v: EnemyView): void {
    v.hidden = true;
    for (const o of [v.body, v.shadow, v.shield, v.barBg, v.barFill, v.shieldFill]) o.setVisible(false);
  }

  private makeSquadView(s: Squad): SquadView {
    const sc = this.scene;
    const troopers = s.troopers.map((_, i) => {
      const id = i === 0 && s.def.leadArt ? s.def.leadArt : s.def.art;
      const body = addArt(sc, id).setDepth(Depth.trooper);
      body.setScale(body.scale * UNIT_DRAW_SCALE);
      return {
        shadow: sc.add.image(0, 0, 'fx.shadow').setDisplaySize(26, 26).setDepth(Depth.shadow),
        body,
        rot: art(id).rotation,
      };
    });
    return {
      squad: s,
      troopers,
      arc: sc.add.graphics().setDepth(Depth.arc),
      bars: sc.add.graphics().setDepth(Depth.bars),
      arcKey: '',
      barsKey: '',
    };
  }

  private drawArc(v: SquadView): void {
    const s = v.squad;
    const range = this.world.rangeOf(s);
    const selected = this.selected === s;
    const key = `${s.facing.toFixed(3)}|${range}|${selected}|${s.down}|${s.x.toFixed(0)},${s.y.toFixed(0)}`;
    if (key === v.arcKey) return;
    v.arcKey = key;
    const g = v.arc.clear();
    if (s.down) return;
    const half = (s.def.arcDeg * Math.PI) / 360;
    const a0 = s.facing - half, a1 = s.facing + half;
    g.fillStyle(Palette.fdcAccent, selected ? 0.11 : 0.045).slice(s.x, s.y, range, a0, a1).fillPath();
    g.lineStyle(selected ? 2 : 1.2, Palette.fdcAccent, selected ? 0.6 : 0.22);
    g.lineBetween(s.x, s.y, s.x + Math.cos(a0) * range, s.y + Math.sin(a0) * range);
    g.lineBetween(s.x, s.y, s.x + Math.cos(a1) * range, s.y + Math.sin(a1) * range);
    g.beginPath().arc(s.x, s.y, range, a0, a1).strokePath();
  }

  private drawBars(v: SquadView): void {
    const s = v.squad;
    const max = s.def.tiers[s.tier].trooperHp;
    let key = `${s.tier}|${s.down ? Math.ceil(s.downTimer) : -1}|${s.x.toFixed(0)},${s.y.toFixed(0)}`;
    for (const t of s.troopers) key += t.alive ? `|${Math.round((t.hp / max) * 8)}` : '|x';
    if (key === v.barsKey) return;
    v.barsKey = key;
    const g = v.bars.clear();
    const n = s.troopers.length;
    const w = 9, gap = 2;
    const x0 = s.x - (n * (w + gap) - gap) / 2, y = s.y + 24;
    if (s.down) {
      // Down marker: red cross + countdown arc.
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
    // Tier chevrons.
    for (let i = 0; i <= s.tier; i++) {
      const cx = s.x - (s.tier * 8) / 2 + i * 8, cy = y + 10;
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
      this.drawArc(v);
      this.drawBars(v);
      for (let i = 0; i < s.troopers.length; i++) this.updateTrooper(v.troopers[i], s.troopers[i], s, alpha);
    }

    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      const v = this.enemyViews.get(e);
      if (v) this.updateEnemy(v, e, alpha, dt);
    }

    // Shells: views are matched to the projectile list by index each frame.
    const shells = this.world.projectiles;
    while (this.shellViews.length < shells.length) {
      this.shellViews.push({
        shadow: this.scene.add.image(0, 0, 'fx.shadow').setDisplaySize(10, 8).setDepth(Depth.shadow),
        shell: addArt(this.scene, 'fx.shell').setDepth(Depth.shell),
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
      const h = Math.sin(Math.PI * k) * Math.min(70, Math.hypot(p.tx - p.x0, p.ty - p.y0) * 0.3);
      sv.shadow.setVisible(true).setPosition(x, y);
      sv.shell.setVisible(true).setPosition(x, y - h).setRotation(Math.atan2(p.ty - p.y0, p.tx - p.x0) - (k - 0.5) * 1.2)
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
    // Little walk wobble for life.
    const wobble = e.engaged ? Math.sin(this.t * 18 + e.id) * 0.25 : Math.sin(this.t * 10 + e.id) * 0.08;
    v.body.setPosition(x, y).setRotation(e.heading + a.rotation + wobble);
    v.shadow.setPosition(x + 3, y + 5).setDisplaySize(r * 3, r * 2.6);

    if (v.flash > 0) {
      v.flash -= dt;
      if (v.flash <= 0) v.body.setTintMode(Phaser.TintModes.MULTIPLY).setTint(e.berserk ? 0xff8070 : 0xffffff);
    } else if (e.berserk) {
      v.body.setTint(Math.sin(this.t * 14) > 0 ? 0xff6050 : 0xffb0a0);
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

  shot(_s: Squad, t: Trooper, toX: number, toY: number, hit: boolean): void {
    const mx = t.x + Math.cos(t.angle) * 12, my = t.y + Math.sin(t.angle) * 12;
    this.fx.flash('fx.muzzle', mx, my, t.angle, ART_SCALE * 0.9, ART_SCALE * 1.2, 0.05, 0xffffff, 1, Depth.muzzle, 0);
    this.fx.light(mx, my, 60, 0xffd890, 0.35, 0.06);
    this.fx.tracer(mx, my, toX, toY);
    if (hit) this.fx.sparks.explode(2, toX, toY);
    sfx.rifle();
  }

  shellFired(_s: Squad, t: Trooper): void {
    const mx = t.x + Math.cos(t.angle) * 14, my = t.y + Math.sin(t.angle) * 14;
    this.fx.flash('fx.muzzle', mx, my, t.angle, ART_SCALE * 1.3, ART_SCALE * 1.8, 0.08, 0xffd0a0, 1, Depth.muzzle, 0);
    this.fx.smoke.explode(3, mx, my);
    sfx.launcher();
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
      } else {
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

  squadRestored(s: Squad): void {
    this.fx.ring(s.x, s.y, 10, 40, 0x7be08a, 0.4);
    this.fx.number(s.x, s.y - 28, 'BACK IN ACTION', 0x7be08a);
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

  squadRemoved(s: Squad, refund: number): void {
    const v = this.squadViews.get(s);
    if (v) {
      for (const t of v.troopers) {
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
