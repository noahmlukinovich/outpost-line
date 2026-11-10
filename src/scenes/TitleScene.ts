/**
 * Title screen with a live "attract mode" skirmish in the background.
 *
 * This is NOT the real game simulation (that arrives in M1, in src/sim). It's a self-contained
 * showcase used to check on the iPad that the art style, lighting, effects, audio, touch input
 * and object pooling all work at 60fps.
 */
import Phaser from 'phaser';
import { DPR, fitCamera, isStandalone, logicalSize, safeAreaInsets } from '../app/display';
import { pwaStatus } from '../app/pwa';
import { ART_SCALE } from '../assets/placeholderArt';
import { Palette, css } from '../assets/palette';
import { Pool } from '../core/Pool';
import { sfx } from '../audio/Sfx';

type Img = Phaser.GameObjects.Image;

interface Skitter {
  img: Img;
  shadow: Img;
  hp: number;
  speed: number;
  wobble: number;
  flash: number;
  alive: boolean;
}

interface Trooper {
  img: Img;
  shadow: Img;
  muzzle: Img;
  muzzleT: number;
  angle: number;
  cooldown: number;
}

interface Tracer {
  img: Img;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  target: Skitter | null;
}

interface Decal {
  img: Img;
  life: number;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ARC = Phaser.Math.DegToRad(140);
const RANGE = 360;
/** Units are drawn 1.4x their texture design size so they read well on an iPad mini. */
const UNIT = ART_SCALE * 1.4;

export class TitleScene extends Phaser.Scene {
  private W = 0;
  private H = 0;
  private squadX = 0;
  private squadY = 0;

  private skitters: Skitter[] = [];
  private skitterPool!: Pool<Skitter>;
  private tracerPool!: Pool<Tracer>;
  private tracers: Tracer[] = [];
  private decalPool!: Pool<Decal>;
  private decals: Decal[] = [];
  private troopers: Trooper[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gore!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private spawnTimer = 0;
  private statusText!: Phaser.GameObjects.Text;
  private statusTimer = 0;
  private deployed = false;

  constructor() {
    super('Title');
  }

  create(): void {
    fitCamera(this.cameras.main);
    ({ width: this.W, height: this.H } = logicalSize(this.game));
    this.skitters = [];
    this.tracers = [];
    this.decals = [];
    this.troopers = [];
    this.deployed = sfx.ready;

    this.buildBattlefield();
    this.buildUi();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.input.on('pointerdown', this.onTapBattlefield, this);
  }

  private onResize(): void {
    // Simplest correct response for a title screen: rebuild the layout.
    this.scene.restart();
  }

  // ---------------------------------------------------------------- battlefield

  private buildBattlefield(): void {
    const { W, H } = this;
    this.squadX = W * 0.28;
    this.squadY = H * 0.58;

    this.add.tileSprite(0, 0, W, H, 'env.ground').setOrigin(0, 0).setDepth(0);

    // Decals (splats/scorch marks) live just above the ground.
    this.decalPool = new Pool(() => {
      const img = this.add.image(0, 0, 'fx.splat').setScale(ART_SCALE).setDepth(1).setVisible(false);
      return { img, life: 0 };
    }, 32, 80);

    // Floodlight pooling around the squad: additive blend reads as light on dark ground.
    this.add
      .image(this.squadX + 40, this.squadY, 'fx.light')
      .setDisplaySize(760, 760)
      .setTint(0xffd9a0)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(2);

    // Firing arc (Door Kickers-style soft cone).
    const arc = this.add.graphics().setDepth(3);
    arc.fillStyle(Palette.fdcAccent, 0.06).slice(this.squadX, this.squadY, RANGE, -ARC / 2, ARC / 2).fillPath();
    arc.lineStyle(1.5, Palette.fdcAccent, 0.35);
    for (const a of [-ARC / 2, ARC / 2]) {
      arc.lineBetween(this.squadX, this.squadY, this.squadX + Math.cos(a) * RANGE, this.squadY + Math.sin(a) * RANGE);
    }
    arc.lineStyle(1, Palette.fdcAccent, 0.18).beginPath().arc(this.squadX, this.squadY, RANGE, -ARC / 2, ARC / 2).strokePath();

    // Cover + squad
    this.add.image(this.squadX + 28, this.squadY, 'fx.shadow').setDisplaySize(90, 120).setAlpha(0.6).setDepth(4);
    this.add.image(this.squadX + 28, this.squadY, 'cover.sandbags').setScale(UNIT).setDepth(5);
    const offsets: [number, number][] = [[0, -30], [10, -10], [10, 12], [0, 32]];
    for (const [ox, oy] of offsets) {
      const x = this.squadX + ox, y = this.squadY + oy;
      const shadow = this.add.image(x + 3, y + 4, 'fx.shadow').setDisplaySize(40, 40).setDepth(6);
      const img = this.add.image(x, y, 'unit.trooper').setScale(UNIT).setDepth(8);
      const muzzle = this.add
        .image(x, y, 'fx.muzzle')
        .setScale(UNIT)
        .setOrigin(0, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(9)
        .setVisible(false);
      this.troopers.push({ img, shadow, muzzle, muzzleT: 0, angle: 0, cooldown: Math.random() * 0.5 });
    }

    this.skitterPool = new Pool(() => {
      const shadow = this.add.image(0, 0, 'fx.shadow').setDisplaySize(42, 34).setDepth(6).setVisible(false);
      const img = this.add.image(0, 0, 'enemy.skitter').setScale(UNIT).setDepth(7).setVisible(false);
      return { img, shadow, hp: 0, speed: 0, wobble: 0, flash: 0, alive: false };
    }, 40, 120);

    this.tracerPool = new Pool(() => {
      const img = this.add
        .image(0, 0, 'fx.tracer')
        .setScale(ART_SCALE)
        .setOrigin(1, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(10)
        .setVisible(false);
      return { img, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 0, target: null };
    }, 40, 150);

    this.sparks = this.add
      .particles(0, 0, 'fx.spark', {
        speed: { min: 60, max: 220 },
        lifespan: { min: 150, max: 350 },
        scale: { start: 0.5, end: 0 },
        tint: [0xffe7a3, 0xffffff, 0xffb238],
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(11);
    this.gore = this.add
      .particles(0, 0, 'fx.spark', {
        speed: { min: 40, max: 160 },
        lifespan: { min: 250, max: 500 },
        scale: { start: 0.9, end: 0.1 },
        tint: [Palette.choirBody, Palette.choirCore, Palette.ichor],
        emitting: false,
      })
      .setDepth(11);
    this.fire = this.add
      .particles(0, 0, 'fx.soft', {
        speed: { min: 60, max: 320 },
        lifespan: { min: 250, max: 700 },
        scale: { start: 0.9, end: 0.1 },
        alpha: { start: 1, end: 0 },
        tint: [0xffd27a, 0xff8a2b, 0xff5a1f, 0x777777],
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(12);

    this.add.image(0, 0, 'fx.vignette').setOrigin(0, 0).setDisplaySize(this.W, this.H).setDepth(50);
  }

  // ---------------------------------------------------------------- UI

  private buildUi(): void {
    const { W, H } = this;
    const inset = safeAreaInsets();
    const right = W - Math.max(32, inset.right + 24);
    const titleSize = Math.round(Phaser.Math.Clamp(W * 0.062, 40, 84));

    this.add
      .text(right, H * 0.16, 'OUTPOST LINE', {
        fontFamily: FONT,
        fontSize: `${titleSize}px`,
        fontStyle: '900',
        color: css(Palette.uiAmber),
        resolution: DPR,
      })
      .setOrigin(1, 0.5)
      .setLetterSpacing(titleSize * 0.08)
      .setShadow(0, 4, '#000000', 12, false, true)
      .setDepth(100);

    this.add
      .text(right, H * 0.16 + titleSize * 0.75, 'FRONTIER DEFENSE COMMAND  ·  KESTREL’S REACH', {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: '600',
        color: css(Palette.uiText),
        resolution: DPR,
      })
      .setOrigin(1, 0.5)
      .setLetterSpacing(3)
      .setAlpha(0.8)
      .setDepth(100);

    // Big, finger-friendly button (well over the 48pt minimum).
    const bw = 300, bh = 68;
    const bx = right - bw, by = H * 0.16 + titleSize * 0.75 + 40;
    const btn = this.add.graphics().setDepth(100);
    const label = this.add
      .text(bx + bw / 2, by + bh / 2, '', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: '800',
        color: css(Palette.uiPanel),
        resolution: DPR,
      })
      .setOrigin(0.5)
      .setLetterSpacing(4)
      .setDepth(101);
    const hint = this.add
      .text(bx + bw, by + bh + 22, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: css(Palette.uiText),
        resolution: DPR,
        align: 'right',
      })
      .setOrigin(1, 0)
      .setAlpha(0.75)
      .setDepth(100);

    const draw = (pressed: boolean) => {
      btn.clear();
      btn.fillStyle(0x000000, 0.45).fillRoundedRect(bx + 3, by + 5, bw, bh, 8);
      btn.fillStyle(this.deployed ? Palette.uiDim : Palette.uiAmber, 1).fillRoundedRect(bx, by + (pressed ? 2 : 0), bw, bh, 8);
      label.setText(this.deployed ? 'DEPLOYED' : 'TAP TO DEPLOY').setY(by + bh / 2 + (pressed ? 2 : 0));
      hint.setText(
        this.deployed
          ? 'Audio on. Tap the battlefield to call in a strike.\nFirst mission arrives in Milestone 1.'
          : 'Tap to enable sound.',
      );
    };
    draw(false);

    const zone = this.add.zone(bx, by, bw, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(102);
    zone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      sfx.unlock();
      draw(true);
    });
    zone.on('pointerup', () => {
      this.deployed = true;
      sfx.click();
      draw(false);
    });
    zone.on('pointerout', () => draw(false));

    this.statusText = this.add
      .text(Math.max(16, inset.left + 12), H - Math.max(14, inset.bottom + 8), '', {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '12px',
        color: css(Palette.uiDim),
        resolution: DPR,
      })
      .setOrigin(0, 1)
      .setDepth(100);
    this.updateStatus();
  }

  private updateStatus(): void {
    const fps = Math.round(this.game.loop.actualFps);
    const parts = [
      `v${__APP_VERSION__}`,
      `${isStandalone() ? 'installed app' : 'browser tab'}`,
      `offline-ready: ${pwaStatus.offlineReady ? 'yes' : pwaStatus.swSupported ? 'no' : 'n/a'}`,
      `${Math.round(this.W)}×${Math.round(this.H)} @${DPR}x`,
      `${fps} fps`,
      `pool ${this.skitterPool.inUse}/${this.skitterPool.size}`,
    ];
    this.statusText.setText(parts.join('  ·  '));
  }

  // ---------------------------------------------------------------- input

  private onTapBattlefield(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (!this.deployed) return;
    // Pointer coords are in device pixels; world coords are CSS px (camera zoom = DPR).
    const pt = this.cameras.main.getWorldPoint(p.x, p.y);
    this.explode(pt.x, pt.y);
  }

  private explode(x: number, y: number): void {
    sfx.explosion();
    this.fire.explode(36, x, y);
    this.cameras.main.shake(220, 0.006);
    const flash = this.add
      .image(x, y, 'fx.light')
      .setTint(0xffc070)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(40, 40)
      .setDepth(13);
    this.tweens.add({
      targets: flash,
      displayWidth: 260,
      displayHeight: 260,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.spawnDecal(x, y, 0x0c0b09, 2.4);
    for (const s of this.skitters) {
      if (s.alive && Phaser.Math.Distance.Between(x, y, s.img.x, s.img.y) < 80) this.kill(s);
    }
  }

  // ---------------------------------------------------------------- simulation (demo only)

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25 + Math.random() * 0.7;
      const n = Math.random() < 0.2 ? 5 : 1;
      for (let i = 0; i < n; i++) this.spawnSkitter();
    }

    for (let i = this.skitters.length - 1; i >= 0; i--) {
      const s = this.skitters[i];
      if (!s.alive) {
        this.skitters.splice(i, 1);
        continue;
      }
      s.wobble += dt * 6;
      const vy = (this.squadY - s.img.y) * 0.25 + Math.sin(s.wobble) * 30;
      const vx = -s.speed;
      s.img.x += vx * dt;
      s.img.y += vy * dt;
      s.img.rotation = Math.atan2(vy, vx);
      s.shadow.setPosition(s.img.x + 3, s.img.y + 4);
      if (s.flash > 0) {
        s.flash -= dt;
        if (s.flash <= 0) s.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      if (s.img.x < this.squadX + 50) this.despawn(s);
    }

    for (const t of this.troopers) this.updateTrooper(t, dt);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      tr.img.setPosition(tr.x0 + (tr.x1 - tr.x0) * k, tr.y0 + (tr.y1 - tr.y0) * k);
      if (k >= 1) {
        if (tr.target?.alive) this.hit(tr.target, tr.x1, tr.y1);
        tr.img.setVisible(false);
        tr.target = null;
        this.tracers.splice(i, 1);
        this.tracerPool.release(tr);
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      d.img.setAlpha(Math.min(1, d.life / 2));
      if (d.life <= 0) {
        d.img.setVisible(false);
        this.decals.splice(i, 1);
        this.decalPool.release(d);
      }
    }

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      this.updateStatus();
    }
  }

  private spawnSkitter(): void {
    const s = this.skitterPool.acquire();
    if (!s) return;
    const x = this.W + 20 + Math.random() * 60;
    const y = this.H * (0.15 + Math.random() * 0.75);
    s.img.setPosition(x, y).setVisible(true).setAlpha(1).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.shadow.setPosition(x + 3, y + 4).setVisible(true);
    s.hp = 3;
    s.speed = 60 + Math.random() * 60;
    s.wobble = Math.random() * 10;
    s.flash = 0;
    s.alive = true;
    this.skitters.push(s);
  }

  private updateTrooper(t: Trooper, dt: number): void {
    t.cooldown -= dt;
    if (t.muzzleT > 0) {
      t.muzzleT -= dt;
      if (t.muzzleT <= 0) t.muzzle.setVisible(false);
    }

    // Find the closest enemy inside this trooper's arc and range.
    let best: Skitter | null = null;
    let bestD = RANGE;
    for (const s of this.skitters) {
      if (!s.alive) continue;
      const dx = s.img.x - this.squadX, dy = s.img.y - this.squadY;
      const d = Math.hypot(dx, dy);
      if (d < bestD && Math.abs(Math.atan2(dy, dx)) <= ARC / 2) {
        best = s;
        bestD = d;
      }
    }
    const desired = best ? Math.atan2(best.img.y - t.img.y, best.img.x - t.img.x) : 0;
    t.angle = Phaser.Math.Angle.RotateTo(t.angle, desired, 6 * dt);
    t.img.rotation = t.angle;

    if (best && t.cooldown <= 0 && Math.abs(Phaser.Math.Angle.Wrap(desired - t.angle)) < 0.12) {
      t.cooldown = 0.28 + Math.random() * 0.4;
      const tipX = t.img.x + Math.cos(t.angle) * 15;
      const tipY = t.img.y + Math.sin(t.angle) * 15;
      t.muzzle.setPosition(tipX, tipY).setRotation(t.angle).setVisible(true);
      t.muzzleT = 0.05;
      sfx.rifle();
      const tr = this.tracerPool.acquire();
      if (!tr) return;
      const miss = Math.random() < 0.2;
      tr.x0 = tipX;
      tr.y0 = tipY;
      tr.x1 = best.img.x + (miss ? (Math.random() - 0.5) * 50 : 0);
      tr.y1 = best.img.y + (miss ? (Math.random() - 0.5) * 50 : 0);
      tr.t = 0;
      tr.dur = Math.hypot(tr.x1 - tipX, tr.y1 - tipY) / 1400;
      tr.target = miss ? null : best;
      tr.img.setPosition(tipX, tipY).setRotation(Math.atan2(tr.y1 - tipY, tr.x1 - tipX)).setVisible(true);
      this.tracers.push(tr);
    }
  }

  private hit(s: Skitter, x: number, y: number): void {
    s.hp -= 1;
    this.sparks.explode(5, x, y);
    s.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    s.flash = 0.06;
    if (s.hp <= 0) this.kill(s);
  }

  private kill(s: Skitter): void {
    sfx.squish();
    this.gore.explode(10, s.img.x, s.img.y);
    this.spawnDecal(s.img.x, s.img.y, 0xffffff, 1);
    this.despawn(s);
  }

  private despawn(s: Skitter): void {
    s.alive = false;
    s.img.setVisible(false);
    s.shadow.setVisible(false);
    this.skitterPool.release(s);
  }

  private spawnDecal(x: number, y: number, tint: number, scale: number): void {
    const d = this.decalPool.acquire();
    if (!d) return;
    d.life = 6;
    d.img
      .setPosition(x, y)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(ART_SCALE * scale)
      .setTint(tint)
      .setAlpha(1)
      .setVisible(true);
    this.decals.push(d);
  }
}
