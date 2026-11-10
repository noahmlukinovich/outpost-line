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

/** A moving, growing, fading sprite: fireballs, smoke, flames, trails. */
interface Puff {
  img: Img;
  life: number;
  max: number;
  vx: number;
  vy: number;
  drag: number;
  grow: number;
  a0: number;
  /** Tint ramp over lifetime (fire: white → yellow → orange → smoke). Empty = constant. */
  ramp: readonly number[];
  rise: number;
}

/** A small physical object: casings, belt links, debris, gibs. Flies, bounces, settles, fades. */
interface Bit {
  img: Img;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  vr: number;
  life: number;
  settled: boolean;
  bounces: number;
  scale: number;
  clink: boolean;
}

export const FIRE_RAMP = [0xffffff, 0xfff0b0, 0xffc060, 0xff8a2b, 0xd84a1a, 0x5a2a1a] as const;
const FLAME_RAMP = [0xffffff, 0xffe6a0, 0xffb050, 0xff7a24, 0xc8401a, 0x3a2a24] as const;

interface FloatText {
  text: Phaser.GameObjects.Text;
  life: number;
  vy: number;
}

const MAX_IMAGES = 400;
const MAX_DECALS = 90;
const MAX_TEXTS = 40;
const MAX_PUFFS = 360;
const MAX_BITS = 260;
const GRAVITY = 520;

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

  readonly embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  private freePuffs: Puff[] = [];
  private puffs: Puff[] = [];
  private puffCount = 0;
  private freeBits: Bit[] = [];
  private bits: Bit[] = [];
  private bitCount = 0;
  private fires: { x: number; y: number; r: number; life: number; tick: number }[] = [];
  /** Called when a casing first hits the ground (for the tinkle sound). */
  onClink?: () => void;

  damageNumbers = true;
  screenShake = true;
  /** Low = fewer particles, no casings or ambient (for older devices). */
  high = true;

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
      speed: { min: 50, max: 200 }, lifespan: { min: 120, max: 300 }, scale: { start: 0.3, end: 0 },
      tint: [0xffe7a3, 0xffffff, 0xffb238], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.fx);
    this.gore = scene.add.particles(0, 0, 'fx.spark', {
      speed: { min: 30, max: 150 }, lifespan: { min: 200, max: 420 }, scale: { start: 0.4, end: 0.05 },
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
      speed: { min: 80, max: 260 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.4, end: 0 },
      tint: [Palette.shield, 0xffffff, 0x9fe0ff], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.fx);
    this.embers = scene.add.particles(0, 0, 'fx.ember', {
      speed: { min: 30, max: 160 }, lifespan: { min: 600, max: 1400 }, scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 }, gravityY: -40, tint: [0xffd27a, 0xff9a3a, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(Depth.light);
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

  /**
   * A tracer streak from (x0, y0) to (x1, y1). `color` tints it, `length` is the tail length
   * (world units), `width` its thickness, `speed` its travel speed.
   */
  tracer(x0: number, y0: number, x1: number, y1: number, enemy = false, color = 0xffe7a3, length = 34, width = 1.6, speed = 1700): void {
    const f = this.take();
    if (!f) return;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    f.kind = Kind.Tracer;
    f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1;
    if (enemy) {
      f.life = f.max = Math.max(0.05, dist / 650);
      f.img.setTexture('fx.tracer2').setTint(0xff6ae0).setScale(26 / 128, 3.2 / 8);
    } else {
      f.life = f.max = Math.max(0.03, dist / speed);
      f.img.setTexture('fx.tracer2').setTint(color).setScale(Math.min(length, dist) / 128, width / 8 * 2);
    }
    f.img.setOrigin(1, 0.5).setRotation(Math.atan2(y1 - y0, x1 - x0)).setPosition(x0, y0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(Depth.fx);
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
    f.s0 = ((r0 * 2) / 64) * ART_SCALE; f.s1 = ((r1 * 2) / 64) * ART_SCALE; f.a0 = 0.9;
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
    // Stack texts that pop at the same place at the same time instead of overlapping.
    let yy = y - 10;
    for (const o of this.activeText) {
      if (o.life > 0.55 && Math.abs(o.text.x - x) < 60 && Math.abs(o.text.y - yy) < 14) yy = o.text.y - 16;
    }
    t.text.setText(value).setColor(css(color)).setPosition(x + (Math.random() - 0.5) * 6, yy)
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

  explosion(x: number, y: number, radius: number, big = false): void {
    const q = this.high ? 1 : 0.4;
    // 1. Blinding flash.
    this.flash('fx.light', x, y, 0, (radius * 3.2) / 256, (radius * 4.4) / 256, 0.1, 0xffffff, 0.9, Depth.light);
    this.light(x, y, radius * 5, 0xffa040, 0.5, 0.35);
    // 2. Fireball: puffs that burst outward and cool from white to dark orange.
    const nFire = Math.round((8 + radius * 0.2) * q);
    for (let i = 0; i < nFire; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = radius * (1.2 + Math.random() * 2.2);
      this.puff('fx.fireball', x, y, radius * (0.35 + Math.random() * 0.3), radius * 1.4, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + Math.random() * 0.25, 1, FIRE_RAMP, true, Depth.fx, 0.01);
    }
    // 3. Smoke that lingers and rises.
    const nSmoke = Math.round((5 + radius * 0.12) * q);
    for (let i = 0; i < nSmoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = radius * (0.3 + Math.random() * 0.8);
      this.puff('fx.smoke', x + Math.cos(a) * radius * 0.3, y + Math.sin(a) * radius * 0.3, radius * 0.7, radius * 0.9, Math.cos(a) * sp, Math.sin(a) * sp, 1.8 + Math.random() * 1.4, 0.5, 0x7a746a, false, Depth.light - 1, 0.25, 10);
    }
    // 4. Shockwave, dust ring, embers, sparks, debris.
    this.ring(x, y, radius * 0.3, radius * 1.3, 0xb08860, 0.2);
    this.dust.explode(Math.round(10 * q), x, y);
    this.embers.explode(Math.round((8 + radius * 0.15) * q), x, y);
    this.sparks.explode(Math.round(10 * q), x, y);
    this.debris(x, y, big ? 10 : 5, 'fx.chunk', radius * 3.5, 1.1);
    // 5. Scorch mark.
    this.decal('fx.scorch', x, y, ((radius * 1.5) / 64) * ART_SCALE, 0xffffff, 30, 0.5);
  }


  // ------------------------------------------------------------------ puffs & bits

  private takePuff(): Puff | null {
    let p = this.freePuffs.pop();
    if (!p) {
      if (this.puffCount >= MAX_PUFFS) return null;
      this.puffCount++;
      p = { img: this.scene.add.image(0, 0, 'fx.fireball').setVisible(false), life: 0, max: 1, vx: 0, vy: 0, drag: 1, grow: 0, a0: 1, ramp: [], rise: 0 };
    }
    return p;
  }

  /**
   * Spawn a puff. `size` is the starting diameter (world units); it grows by `grow` units/sec.
   */
  puff(tex: string, x: number, y: number, size: number, grow: number, vx: number, vy: number, life: number, alpha: number, tint: number | readonly number[], additive: boolean, depth: number = Depth.fx, drag = 0.1, rise = 0): void {
    const p = this.takePuff();
    if (!p) return;
    const ramp = typeof tint === 'number' ? [] : tint;
    p.life = p.max = life;
    p.vx = vx;
    p.vy = vy;
    p.drag = drag;
    p.grow = grow;
    p.a0 = alpha;
    p.ramp = ramp;
    p.rise = rise;
    const w = p.img.setTexture(tex).width;
    p.img.setVisible(true).setPosition(x, y).setScale(size / w).setAlpha(alpha).setRotation(Math.random() * 6.28)
      .setTint(typeof tint === 'number' ? tint : ramp[0]).setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      // Additive and normal sprites on separate sub-layers so the GPU can batch them.
      .setDepth(depth + (additive ? 0.3 : 0.1));
    this.puffs.push(p);
  }

  private takeBit(): Bit | null {
    let b = this.freeBits.pop();
    if (!b) {
      if (this.bitCount >= MAX_BITS) {
        // Recycle the oldest settled bit.
        const i = this.bits.findIndex((q) => q.settled);
        if (i < 0) return null;
        b = this.bits.splice(i, 1)[0];
      } else {
        this.bitCount++;
        b = { img: this.scene.add.image(0, 0, 'fx.casing').setVisible(false), x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vr: 0, life: 0, settled: false, bounces: 0, scale: 1, clink: false };
      }
    }
    return b;
  }

  /** Throw a physical bit (casing, link, debris) with a launch velocity and upward speed. */
  bit(tex: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number, life: number, clink = false, tint = 0xffffff): void {
    const b = this.takeBit();
    if (!b) return;
    b.x = x; b.y = y; b.z = z;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.vr = (Math.random() - 0.5) * 30;
    b.life = life;
    b.settled = false;
    b.bounces = 0;
    b.scale = scale;
    b.clink = clink;
    b.img.setTexture(tex).setVisible(true).setAlpha(1).setTint(tint).setScale(scale).setRotation(Math.random() * 6.28)
      .setPosition(x, y - z).setDepth(Depth.fx - 0.4);
    this.bits.push(b);
  }

  /** Brass flies out of the ejection port to the gun's right, slightly backwards. */
  casing(x: number, y: number, angle: number, kind: 'small' | 'big' | 'shell' | 'link'): void {
    if (!this.high && Math.random() < 0.7) return;
    const side = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const back = angle + Math.PI;
    const sp = (kind === 'big' ? 70 : kind === 'shell' ? 55 : 90) * (0.7 + Math.random() * 0.6);
    const vx = Math.cos(side) * sp + Math.cos(back) * 18;
    const vy = Math.sin(side) * sp + Math.sin(back) * 18;
    const tex = kind === 'big' ? 'fx.casing.big' : kind === 'shell' ? 'fx.casing.shell' : kind === 'link' ? 'fx.link' : 'fx.casing';
    this.bit(tex, x, y, 6, vx, vy, 90 + Math.random() * 60, ART_SCALE * (kind === 'link' ? 0.6 : 0.55), 2.2 + Math.random() * 1.3, kind !== 'link');
  }

  /** Muzzle smoke wisp. */
  muzzleSmoke(x: number, y: number, angle: number, amount: number): void {
    const n = this.high ? amount : Math.ceil(amount / 2);
    for (let i = 0; i < n; i++) {
      const sp = 20 + Math.random() * 30;
      const a = angle + (Math.random() - 0.5) * 0.8;
      this.puff('fx.smoke', x, y, 8 + Math.random() * 6, 24, Math.cos(a) * sp, Math.sin(a) * sp, 0.7 + Math.random() * 0.5, 0.28, 0xb8b2a6, false, Depth.fx, 0.15, 6);
    }
  }

  /** Dirt kicked up where a bullet hits the ground. */
  groundHit(x: number, y: number): void {
    this.dust.explode(this.high ? 3 : 1, x, y);
    if (this.high) this.decal('fx.pock', x, y, ART_SCALE * (0.8 + Math.random() * 0.5), 0xffffff, 6, 0.8);
  }

  /** Debris thrown in all directions. */
  debris(x: number, y: number, count: number, tex: string, speed: number, scale: number, tint = 0xffffff): void {
    const n = this.high ? count : Math.ceil(count / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.bit(tex, x, y, 4, Math.cos(a) * sp, Math.sin(a) * sp, 120 + Math.random() * 160, ART_SCALE * scale * (0.6 + Math.random() * 0.5), 3 + Math.random() * 2, false, tint);
    }
  }

  /** Directional flamethrower stream. */
  flameStream(x: number, y: number, angle: number, range: number, arcDeg: number): void {
    const half = (arcDeg * Math.PI) / 360;
    const n = this.high ? 34 : 14;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() * 2 - 1) * half * 0.8;
      const sp = range * (1.8 + Math.random() * 1.4);
      const delayLife = 0.3 + Math.random() * 0.25;
      this.puff('fx.fireball', x, y, 6 + Math.random() * 5, 46 + Math.random() * 30, Math.cos(a) * sp, Math.sin(a) * sp, delayLife, 0.95, FLAME_RAMP, true, Depth.fx, 0.02, 10);
    }
    for (let i = 0; i < (this.high ? 6 : 2); i++) {
      const a = angle + (Math.random() * 2 - 1) * half;
      const d = range * (0.5 + Math.random() * 0.5);
      this.puff('fx.smoke', x + Math.cos(a) * d, y + Math.sin(a) * d, 14, 30, Math.cos(a) * 20, Math.sin(a) * 20, 1.2, 0.3, 0x5a534c, false, Depth.fx, 0.2, 14);
    }
    // Leave a short-lived ground fire where the stream lands.
    this.groundFire(x + Math.cos(angle) * range * 0.7, y + Math.sin(angle) * range * 0.7, range * 0.35, 2.2);
  }

  groundFire(x: number, y: number, r: number, life: number): void {
    if (this.fires.length > 12) this.fires.shift();
    this.fires.push({ x, y, r, life, tick: 0 });
    this.decal('fx.scorch', x, y, ((r * 1.6) / 64) * ART_SCALE, 0xffffff, 20, 0.3);
  }

  /** Rocket exhaust trail (call each frame for each rocket). */
  rocketTrail(x: number, y: number, angle: number): void {
    const bx = x - Math.cos(angle) * 7, by = y - Math.sin(angle) * 7;
    this.puff('fx.fireball', bx, by, 7, 10, -Math.cos(angle) * 40, -Math.sin(angle) * 40, 0.12, 0.9, FIRE_RAMP, true, Depth.shell);
    if (Math.random() < (this.high ? 0.9 : 0.4)) this.puff('fx.smoke', bx, by, 8, 26, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0.9 + Math.random() * 0.5, 0.35, 0xc8c2b8, false, Depth.fx, 0.1, 4);
  }

  /** Floating dust motes and the occasional ember drifting across the battlefield. */
  startAmbient(width: number, height: number): void {
    this.ambient?.destroy();
    this.ambient = this.scene.add.particles(0, 0, 'fx.mote', {
      x: { min: -50, max: width + 50 },
      y: { min: -50, max: height + 50 },
      speedX: { min: 4, max: 16 },
      speedY: { min: -6, max: 6 },
      lifespan: 9000,
      frequency: 140,
      quantity: 1,
      scale: { min: 0.3, max: 0.9 },
      alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.22 },
      tint: [0xd8ccb0, 0xffffff, 0xffc890],
      blendMode: 'ADD',
    }).setDepth(Depth.light);
    if (!this.high) this.ambient.stop();
  }

  setQuality(high: boolean): void {
    this.high = high;
    if (this.ambient) {
      if (high) this.ambient.start();
      else this.ambient.stop();
    }
  }

  // ------------------------------------------------------------------ update

  private updatePuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.img.setVisible(false);
        this.puffs[i] = this.puffs[this.puffs.length - 1];
        this.puffs.pop();
        this.freePuffs.push(p);
        continue;
      }
      const k = 1 - p.life / p.max;
      const damp = Math.pow(p.drag, dt);
      p.vx *= damp;
      p.vy *= damp;
      const img = p.img;
      img.x += p.vx * dt;
      img.y += (p.vy - p.rise) * dt;
      img.scale += (p.grow / img.width) * dt;
      img.alpha = p.a0 * (1 - k) * (1 - k * 0.3);
      if (p.ramp.length) img.setTint(p.ramp[Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length))]);
    }
  }

  private updateBits(dt: number): void {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.img.setVisible(false);
        this.bits[i] = this.bits[this.bits.length - 1];
        this.bits.pop();
        this.freeBits.push(b);
        continue;
      }
      if (!b.settled) {
        b.vz -= GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.img.rotation += b.vr * dt;
        if (b.z <= 0) {
          b.z = 0;
          if (b.clink && b.bounces === 0) this.onClink?.();
          b.bounces++;
          b.vz = -b.vz * 0.35;
          b.vx *= 0.45;
          b.vy *= 0.45;
          b.vr *= 0.5;
          if (b.vz < 25 || b.bounces > 3) {
            b.settled = true;
            b.img.setDepth(Depth.decal);
          }
        }
        b.img.setPosition(b.x, b.y - b.z).setScale(b.scale * (1 + b.z / 120));
      }
      if (b.life < 1) b.img.alpha = b.life;
    }
  }

  update(dt: number): void {
    this.updatePuffs(dt);
    this.updateBits(dt);
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = this.high ? 0.06 : 0.15;
        const a = Math.random() * Math.PI * 2, d = Math.random() * f.r;
        this.puff('fx.fireball', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 6 + Math.random() * 6, 18, 0, 0, 0.45, Math.min(1, f.life), FLAME_RAMP, true, Depth.fx, 0.1, 30);
      }
      if (f.life <= 0) this.fires.splice(i, 1);
    }
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
