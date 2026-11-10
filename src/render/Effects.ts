/**
 * Visual effects ("juice"), all pooled: nothing is created or destroyed during a battle, sprites
 * are recycled. Gameplay never depends on anything in here.
 */
import Phaser from 'phaser';
import { Palette, css } from '../assets/palette';
import { ART_SCALE } from '../assets/placeholderArt';
import { DPR } from '../app/display';
import { Depth } from './depth';

type Img = Phaser.GameObjects.Image;

const enum Kind {
  Tracer,
  Flash,
  Ring,
  Decal,
}

interface Fx {
  img: Img;
  kind: Kind;
  life: number;
  max: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  s0: number;
  s1: number;
  a0: number;
}

interface FloatText {
  text: Phaser.GameObjects.Text;
  life: number;
  vy: number;
}

const MAX_IMAGES = 400;
const MAX_DECALS = 90;
const MAX_TEXTS = 40;

export class Effects {
  private free: Fx[] = [];
  private active: Fx[] = [];
  private decals: Fx[] = [];
  private freeText: FloatText[] = [];
  private activeText: FloatText[] = [];
  private textBudget = 0;
  private created = 0;

  readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly gore: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly fire: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly shards: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;

  damageNumbers = true;
  screenShake = true;

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < 120; i++) this.free.push(this.make());
    for (let i = 0; i < MAX_TEXTS; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          fontStyle: '800',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: DPR * 1.5,
        })
        .setOrigin(0.5)
        .setDepth(Depth.numbers)
        .setVisible(false);
      this.freeText.push({ text, life: 0, vy: 0 });
    }

    this.sparks = scene.add.particles(0, 0, 'fx.spark', {
      speed: { min: 50, max: 200 }, lifespan: { min: 120, max: 300 }, scale: { start: 0.45, end: 0 },
      tint: [0xffe7a3, 0xffffff, 0xffb238], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.fx);
    this.gore = scene.add.particles(0, 0, 'fx.spark', {
      speed: { min: 30, max: 150 }, lifespan: { min: 250, max: 520 }, scale: { start: 0.8, end: 0.1 },
      tint: [Palette.choirBody, Palette.choirCore, Palette.ichor], emitting: false,
    }).setDepth(Depth.fx);
    this.fire = scene.add.particles(0, 0, 'fx.soft', {
      speed: { min: 40, max: 220 }, lifespan: { min: 220, max: 600 }, scale: { start: 0.7, end: 0.05 },
      alpha: { start: 1, end: 0 }, tint: [0xffd27a, 0xff8a2b, 0xff5a1f], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.fx);
    this.smoke = scene.add.particles(0, 0, 'fx.soft', {
      speed: { min: 10, max: 50 }, lifespan: { min: 700, max: 1400 }, scale: { start: 0.5, end: 1.3 },
      alpha: { start: 0.45, end: 0 }, tint: [0x2a2824, 0x3a3631], emitting: false,
    }).setDepth(Depth.fx);
    this.shards = scene.add.particles(0, 0, 'fx.spark', {
      speed: { min: 80, max: 260 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.6, end: 0 },
      tint: [Palette.shield, 0xffffff, 0x9fe0ff], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.fx);
    this.dust = scene.add.particles(0, 0, 'fx.soft', {
      speed: { min: 20, max: 70 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.3, end: 0.8 },
      alpha: { start: 0.4, end: 0 }, tint: [0x6b6048, 0x504838], emitting: false,
    }).setDepth(Depth.fx);
  }

  private make(): Fx {
    this.created++;
    const img = this.scene.add.image(0, 0, 'fx.spark').setVisible(false);
    return { img, kind: Kind.Flash, life: 0, max: 1, x0: 0, y0: 0, x1: 0, y1: 0, s0: 1, s1: 1, a0: 1 };
  }

  private take(): Fx | null {
    const f = this.free.pop() ?? (this.created < MAX_IMAGES ? this.make() : null);
    if (!f) return null;
    f.img.setVisible(true).setAlpha(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.NORMAL).setOrigin(0.5);
    return f;
  }

  // ------------------------------------------------------------------ spawners

  tracer(x0: number, y0: number, x1: number, y1: number, enemy = false): void {
    const f = this.take();
    if (!f) return;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    f.kind = Kind.Tracer;
    f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1;
    f.life = f.max = Math.max(0.03, dist / (enemy ? 700 : 1700));
    f.img.setTexture(enemy ? 'fx.bolt' : 'fx.tracer').setScale(ART_SCALE).setOrigin(1, 0.5)
      .setRotation(Math.atan2(y1 - y0, x1 - x0)).setPosition(x0, y0).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.fx);
    this.active.push(f);
  }

  /** A short-lived sprite that scales from s0 to s1 and fades (muzzle flashes, glows). */
  flash(texture: string, x: number, y: number, rotation: number, s0: number, s1: number, life: number, tint = 0xffffff, alpha = 1, depth: number = Depth.muzzle, originX = 0.5): void {
    const f = this.take();
    if (!f) return;
    f.kind = Kind.Flash;
    f.life = f.max = life;
    f.s0 = s0; f.s1 = s1; f.a0 = alpha;
    f.img.setTexture(texture).setPosition(x, y).setRotation(rotation).setScale(s0).setTint(tint).setAlpha(alpha)
      .setOrigin(originX, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
    this.active.push(f);
  }

  light(x: number, y: number, size: number, tint: number, alpha: number, life: number): void {
    const s = size / 256; // fx.light is 256px
    this.flash('fx.light', x, y, 0, s, s * 1.3, life, tint, alpha, Depth.light);
  }

  ring(x: number, y: number, r0: number, r1: number, tint: number, life: number): void {
    const f = this.take();
    if (!f) return;
    f.kind = Kind.Ring;
    f.life = f.max = life;
    f.s0 = (r0 * 2) / 128; f.s1 = (r1 * 2) / 128; f.a0 = 0.9;
    f.img.setTexture('fx.ring').setPosition(x, y).setScale(f.s0).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.fx);
    this.active.push(f);
  }

  decal(texture: string, x: number, y: number, scale: number, tint = 0xffffff, life = 25, alpha = 1): void {
    let f = this.decals.length >= MAX_DECALS ? this.decals.shift()! : this.take();
    if (!f) return;
    f.kind = Kind.Decal;
    f.life = f.max = life;
    f.img.setVisible(true).setTexture(texture).setPosition(x, y).setRotation(Math.random() * 6.28).setScale(scale)
      .setTint(tint).setAlpha(alpha).setBlendMode(Phaser.BlendModes.NORMAL).setOrigin(0.5).setDepth(Depth.decal);
    f.a0 = alpha;
    this.decals.push(f);
  }

  number(x: number, y: number, value: string, color: number, big = false): void {
    if (this.textBudget <= 0) return;
    const t = this.freeText.pop();
    if (!t) return;
    this.textBudget--;
    t.life = 0.8;
    t.vy = -38;
    t.text.setText(value).setColor(css(color)).setPosition(x + (Math.random() - 0.5) * 10, y - 10)
      .setScale(big ? 1.3 : 1).setAlpha(1).setVisible(true);
    this.activeText.push(t);
  }

  damage(x: number, y: number, amount: number, shield: boolean): void {
    if (!this.damageNumbers || amount < 1) return;
    this.number(x, y, String(Math.round(amount)), shield ? Palette.shield : 0xffffff, amount >= 25);
  }

  shake(intensity: number, ms: number): void {
    if (this.screenShake) this.scene.cameras.main.shake(ms, intensity);
  }

  explosion(x: number, y: number, radius: number): void {
    this.fire.explode(Math.round(radius * 0.35), x, y);
    this.smoke.explode(6, x, y);
    this.sparks.explode(8, x, y);
    this.light(x, y, radius * 4, 0xffb060, 0.45, 0.25);
    this.ring(x, y, radius * 0.3, radius * 1.1, 0xffc070, 0.25);
    this.decal('fx.scorch', x, y, (radius * 1.5) / 128, 0xffffff, 30, 0.45);
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    this.textBudget = Math.min(this.textBudget + dt * 30, 6);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.img.setVisible(false);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.free.push(f);
        continue;
      }
      const k = 1 - f.life / f.max; // 0 → 1
      switch (f.kind) {
        case Kind.Tracer:
          f.img.setPosition(f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k);
          break;
        case Kind.Flash:
          f.img.setScale(f.s0 + (f.s1 - f.s0) * k).setAlpha(f.a0 * (1 - k));
          break;
        case Kind.Ring:
          f.img.setScale(f.s0 + (f.s1 - f.s0) * (1 - (1 - k) * (1 - k))).setAlpha(f.a0 * (1 - k));
          break;
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const f = this.decals[i];
      f.life -= dt;
      f.img.setAlpha(f.a0 * Math.min(1, f.life / 5));
      if (f.life <= 0) {
        f.img.setVisible(false);
        this.decals.splice(i, 1);
        this.free.push(f);
      }
    }
    for (let i = this.activeText.length - 1; i >= 0; i--) {
      const t = this.activeText[i];
      t.life -= dt;
      t.text.y += t.vy * dt;
      t.vy *= 0.94;
      t.text.setAlpha(Math.min(1, t.life * 3));
      if (t.life <= 0) {
        t.text.setVisible(false);
        this.activeText[i] = this.activeText[this.activeText.length - 1];
        this.activeText.pop();
        this.freeText.push(t);
      }
    }
  }
}
