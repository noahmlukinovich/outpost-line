/**
 * Placeholder art, drawn with vector shapes and "baked" into textures at boot.
 *
 * Every texture key here is the same kind of key a real sprite would use, so later the asset
 * manifest (M1) can point a key at an image/atlas instead and nothing else changes.
 * All units are drawn FACING RIGHT (angle 0); the game rotates them.
 */
import Phaser from 'phaser';
import { Palette } from './palette';

type G = Phaser.GameObjects.Graphics;

/** Textures are drawn at 2x so they stay sharp when the camera zooms in. */
const S = 2;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(S, S);
  draw(g);
  g.generateTexture(key, w * S, h * S);
  g.destroy();
}

function trooper(g: G): void {
  // 24x24 box, center 12,12, facing right.
  g.fillStyle(Palette.fdcWeapon, 1).fillRect(12, 13, 11, 2.4); // rifle
  g.fillStyle(Palette.fdcBody, 1).fillEllipse(11, 12, 12, 17); // shoulders / armor
  g.fillStyle(0x4a5662, 1).fillEllipse(9, 12, 6, 13); // backpack shading
  g.fillStyle(Palette.fdcHelmet, 1).fillCircle(12.5, 12, 4.6); // helmet
  g.fillStyle(Palette.fdcAccent, 1).fillRect(15.6, 10.4, 1.6, 3.2); // visor
  g.lineStyle(1, 0x0b0d0f, 0.8).strokeEllipse(11, 12, 12, 17);
}

function skitter(g: G): void {
  // 28x28 box, center 14,14, facing right. A six-legged bio-beast with a glowing core.
  g.lineStyle(1.6, Palette.choirShell, 1);
  for (const side of [-1, 1]) {
    for (const [x, len] of [[9, 7], [14, 8], [19, 6]] as const) {
      g.beginPath();
      g.moveTo(x, 14);
      g.lineTo(x + (x - 14) * 0.4, 14 + side * len);
      g.strokePath();
    }
  }
  g.fillStyle(Palette.choirBody, 1).fillEllipse(14, 14, 18, 11);
  g.fillStyle(Palette.choirShell, 1).fillEllipse(11, 14, 9, 8);
  g.fillStyle(Palette.choirBody, 1).fillTriangle(21, 10, 27, 14, 21, 18); // head/mandibles
  g.fillStyle(Palette.choirCore, 1).fillCircle(15, 14, 2.2);
}

function sandbags(g: G): void {
  // 40x60 arc of bags, open side to the left (troopers stand behind, facing right).
  const bags = 7;
  for (let i = 0; i < bags; i++) {
    const a = Phaser.Math.DegToRad(-60 + (120 * i) / (bags - 1));
    const x = 14 + Math.cos(a) * 20;
    const y = 30 + Math.sin(a) * 25;
    g.fillStyle(Palette.sandbagDark, 1).fillRoundedRect(x - 5, y - 4.5, 11, 10, 3);
    g.fillStyle(Palette.sandbag, 1).fillRoundedRect(x - 5.5, y - 5, 10, 9, 3);
  }
}

/** Smooth radial gradient (canvas-drawn, so no banding). Used for lights, shadows and soft particles. */
function radialTexture(scene: Phaser.Scene, key: string, size: number, rgb: string, stops: [number, number][]): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, alpha] of stops) grad.addColorStop(at, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function muzzleFlash(g: G): void {
  // 24x16, origin at left middle.
  g.fillStyle(Palette.flash, 0.5).fillTriangle(0, 8, 24, 2, 24, 14);
  g.fillStyle(0xffffff, 1).fillTriangle(0, 8, 16, 5, 16, 11);
  g.fillStyle(Palette.flash, 0.9).fillTriangle(2, 8, 8, 0, 10, 8).fillTriangle(2, 8, 8, 16, 10, 8);
}

/** Tileable ground with tonal patches, gravel and cracks. */
function groundTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const rnd = new Phaser.Math.RandomDataGenerator(['outpost']);
  const hex = (c: number, a = 1) =>
    `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  ctx.fillStyle = hex(Palette.ground);
  ctx.fillRect(0, 0, size, size);
  // Draw each mark at 9 offsets so it wraps seamlessly across tile edges.
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };
  for (let i = 0; i < 40; i++) {
    const x = rnd.between(0, size), y = rnd.between(0, size), r = rnd.between(20, 70);
    const c = rnd.pick([Palette.groundLight, Palette.groundDark, Palette.dirt]);
    const a = rnd.realInRange(0.15, 0.35);
    wrap((ox, oy) => {
      const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, hex(c, a));
      grad.addColorStop(1, hex(c, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  for (let i = 0; i < 900; i++) {
    const x = rnd.between(0, size), y = rnd.between(0, size);
    ctx.fillStyle = hex(rnd.pick([0x3b3f34, 0x15170f, 0x47432f]), rnd.realInRange(0.3, 0.7));
    ctx.fillRect(x, y, rnd.between(1, 3), rnd.between(1, 2));
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let x = rnd.between(0, size), y = rnd.between(0, size);
    ctx.strokeStyle = hex(Palette.groundDark, 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += rnd.between(-14, 14);
      y += rnd.between(-14, 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  tex.refresh();
}

/** Generate every placeholder texture. Call once from the Boot scene. */
export function generatePlaceholderArt(scene: Phaser.Scene): void {
  bake(scene, 'unit.trooper', 24, 24, trooper);
  bake(scene, 'enemy.skitter', 28, 28, skitter);
  bake(scene, 'cover.sandbags', 40, 60, sandbags);
  radialTexture(scene, 'fx.shadow', 64, '0,0,0', [[0, 0.6], [0.5, 0.4], [1, 0]]);
  radialTexture(scene, 'fx.light', 256, '255,255,255', [[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]);
  radialTexture(scene, 'fx.soft', 64, '255,255,255', [[0, 1], [0.4, 0.6], [1, 0]]);
  bake(scene, 'fx.muzzle', 24, 16, muzzleFlash);
  bake(scene, 'fx.tracer', 32, 2, (g) => {
    g.fillStyle(Palette.tracer, 0.25).fillRect(0, 0, 16, 2);
    g.fillStyle(Palette.tracer, 1).fillRect(16, 0, 16, 2);
  });
  bake(scene, 'fx.spark', 6, 6, (g) => g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3));
  bake(scene, 'fx.splat', 32, 32, (g) => {
    g.fillStyle(Palette.ichor, 0.85).fillCircle(16, 16, 8);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + i;
      g.fillCircle(16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 2 + (i % 3));
    }
  });
  bake(scene, 'ui.white', 4, 4, (g) => g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4));
  groundTexture(scene, 'env.ground', 512);
}

/** Texture scale to apply to sprites so a baked texture shows at its design size. */
export const ART_SCALE = 1 / S;
