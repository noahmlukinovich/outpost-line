/**
 * Placeholder art, drawn with vector shapes and "baked" into textures at boot.
 *
 * Every texture key here is the same kind of key a real sprite would use, so later the asset
 * manifest (M1) can point a key at an image/atlas instead and nothing else changes.
 * All units are drawn FACING RIGHT (angle 0); the game rotates them.
 */
import Phaser from 'phaser';
import { Palette } from './palette';
import { SOLDIER_H, SOLDIER_ORIGIN, SOLDIER_W, SoldierLooks, drawSoldier } from './soldiers';
import { depot, reactor, turret } from './structures';
import { generateFxArt } from './fxArt';
import { broodbarge, colossus, sensor, skyray, tender, veilstalker } from './choirArt';

type G = Phaser.GameObjects.Graphics;

const v2 = (pts: { x: number; y: number }[]) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/** Textures are drawn at 3× so they stay sharp on Retina screens and when zoomed in. */
const S = 3;

/** Sprite origins for art whose rotation center isn't the texture center (soldiers). */
export const ART_ORIGINS: Record<string, { x: number; y: number }> = {};

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(S, S);
  draw(g);
  g.generateTexture(key, w * S, h * S);
  g.destroy();
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



function warden(g: G): void {
  // 32x32, facing right: hulking shielded warrior with an energy lance.
  g.fillStyle(Palette.choirShell, 1).fillRect(16, 9, 15, 3); // lance
  g.fillStyle(Palette.choirCore, 1).fillCircle(30, 10.5, 2.2);
  g.fillStyle(Palette.choirShell, 1).fillEllipse(14, 16, 16, 26); // pauldrons
  g.fillStyle(Palette.choirBody, 1).fillEllipse(15, 16, 13, 20);
  g.fillStyle(0x6fc8ff, 0.9).fillTriangle(9, 9, 13, 16, 9, 23); // shield emitter
  g.fillStyle(Palette.choirShell, 1).fillEllipse(20, 16, 8, 9); // head crest
  g.fillStyle(Palette.choirCore, 1).fillCircle(22, 16, 1.8);
  g.lineStyle(1, 0x200815, 0.9).strokeEllipse(14, 16, 16, 26);
}

function ironback(g: G): void {
  // 48x48, facing right: armored war-beast with overlapping plates.
  g.fillStyle(0x2c1022, 1).fillEllipse(22, 24, 40, 34);
  g.fillStyle(0x4b4552, 1);
  for (let i = 0; i < 4; i++) g.fillEllipse(10 + i * 7, 24, 12, 30 - i * 3); // armor plates
  g.lineStyle(1.2, 0x1a1720, 1);
  for (let i = 0; i < 4; i++) g.strokeEllipse(10 + i * 7, 24, 12, 30 - i * 3);
  g.fillStyle(Palette.choirBody, 1).fillEllipse(38, 24, 14, 13); // head
  g.fillStyle(0xd9d2c0, 1).fillTriangle(42, 18, 47, 15, 44, 21).fillTriangle(42, 30, 47, 33, 44, 27); // tusks
  g.fillStyle(Palette.choirCore, 1).fillCircle(41, 24, 2);
  g.fillStyle(Palette.choirCore, 0.8).fillCircle(14, 13, 1.5).fillCircle(14, 35, 1.5); // vents
}

function trench(g: G): void {
  // 64x36: zig-zag trench with sandbag lip on the road side (right).
  g.fillStyle(0x1a1610, 1).fillRoundedRect(10, 4, 30, 28, 6);
  g.fillStyle(0x0e0c08, 1).fillRoundedRect(14, 8, 22, 20, 4);
  for (let i = 0; i < 6; i++) {
    g.fillStyle(Palette.sandbagDark, 1).fillRoundedRect(40, 2 + i * 5.4, 9, 6, 2);
    g.fillStyle(Palette.sandbag, 1).fillRoundedRect(39.5, 1.6 + i * 5.4, 8.5, 5.4, 2);
  }
  g.lineStyle(1, 0x5e5238, 0.6).strokeRoundedRect(10, 4, 30, 28, 6);
}

function ruins(g: G): void {
  // 64x64: broken concrete walls (L-shape) open to the back (left).
  const wall = (x: number, y: number, w: number, h: number) => {
    g.fillStyle(0x4d4d48, 1).fillRect(x, y, w, h);
    g.fillStyle(0x6c6b63, 1).fillRect(x, y, w, Math.min(h, 3));
  };
  wall(44, 8, 8, 20);
  wall(44, 36, 8, 22);
  wall(20, 8, 26, 7);
  wall(14, 50, 20, 7);
  g.fillStyle(0x6c6b63, 1).fillCircle(56, 31, 2.5).fillCircle(38, 26, 2).fillCircle(30, 40, 3).fillCircle(54, 20, 1.6);
}

function bunker(g: G): void {
  // 60x60: concrete pillbox with a firing slit facing right.
  const pts = [
    { x: 18, y: 6 }, { x: 42, y: 6 }, { x: 54, y: 18 }, { x: 54, y: 42 },
    { x: 42, y: 54 }, { x: 18, y: 54 }, { x: 6, y: 42 }, { x: 6, y: 18 },
  ];
  g.fillStyle(0x55574f, 1).fillPoints(v2(pts), true);
  g.lineStyle(2, 0x2a2b26, 1).strokePoints(v2(pts), true);
  g.fillStyle(0x6e7066, 1).fillRect(16, 16, 28, 28);
  g.fillStyle(0x121310, 1).fillRect(46, 22, 7, 16); // firing slit
  g.fillStyle(0x3d3f38, 1).fillCircle(26, 30, 5); // hatch
  g.lineStyle(1, 0x2a2b26, 0.6).strokeRect(16, 16, 28, 28);
}

function gate(g: G): void {
  // 40x140: outpost wall with a gate, drawn vertically.
  g.fillStyle(0x2f3236, 1).fillRect(8, 0, 22, 140);
  g.fillStyle(0x474b50, 1).fillRect(8, 0, 22, 4).fillRect(8, 136, 22, 4);
  g.fillStyle(0x23262a, 1).fillRect(10, 42, 18, 56); // gate opening
  g.lineStyle(2, Palette.uiAmber, 0.9);
  for (let y = 46; y < 96; y += 10) g.lineBetween(12, y, 26, y + 6); // hazard stripes
  g.fillStyle(0x474b50, 1).fillRect(4, 34, 30, 10).fillRect(4, 96, 30, 10); // towers
  g.fillStyle(Palette.fdcAccent, 1).fillCircle(19, 39, 2).fillCircle(19, 101, 2);
}

function floodlight(g: G): void {
  // 24x24 tripod lamp facing right.
  g.lineStyle(2, 0x2a2c2e, 1).lineBetween(8, 12, 2, 4).lineBetween(8, 12, 2, 20).lineBetween(8, 12, 16, 12);
  g.fillStyle(0x4a4e52, 1).fillRoundedRect(10, 7, 9, 10, 2);
  g.fillStyle(0xfff2c4, 1).fillRect(18, 8, 2.5, 8);
}

function crate(g: G): void {
  g.fillStyle(0x5b5a3c, 1).fillRect(2, 2, 20, 20);
  g.lineStyle(1.5, 0x3a392a, 1).strokeRect(2, 2, 20, 20).lineBetween(2, 2, 22, 22).lineBetween(22, 2, 2, 22);
}

function wreck(g: G): void {
  // 64x40 burnt-out vehicle hull.
  g.fillStyle(0x1f1e1b, 1).fillRoundedRect(4, 6, 56, 28, 6);
  g.fillStyle(0x34322d, 1).fillRoundedRect(8, 9, 40, 22, 4);
  g.fillStyle(0x24221e, 1).fillCircle(28, 20, 8);
  g.lineStyle(3, 0x24221e, 1).lineBetween(28, 20, 54, 20);
  g.fillStyle(0x6b2f12, 0.6).fillCircle(18, 14, 3).fillCircle(40, 27, 2.5);
}

function shell(g: G): void {
  g.fillStyle(0x2a2d24, 1).fillEllipse(6, 4, 10, 6);
  g.fillStyle(Palette.uiAmber, 1).fillEllipse(9, 4, 3, 4);
}

function flag(g: G): void {
  // 24x32 rally flag, pole base at (6, 30).
  g.lineStyle(2, 0xd8dde2, 1).lineBetween(6, 30, 6, 3);
  g.fillStyle(Palette.fdcAccent, 1).fillTriangle(7, 3, 22, 8, 7, 14);
  g.fillStyle(0x000000, 0.35).fillEllipse(6, 30, 8, 3);
}

function ring(g: G): void {
  g.lineStyle(2.5, 0xffffff, 1).strokeCircle(32, 32, 29);
}

function shieldBubble(g: G): void {
  g.fillStyle(Palette.shield, 0.12).fillCircle(32, 32, 30);
  g.lineStyle(2, Palette.shield, 0.85).strokeCircle(32, 32, 29);
  g.lineStyle(1, 0xffffff, 0.5).beginPath().arc(32, 32, 25, -2.4, -1.2).strokePath();
}

function scorch(g: G): void {
  g.fillStyle(0x0c0b09, 0.7).fillCircle(32, 32, 20);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3;
    g.fillStyle(0x0c0b09, 0.5).fillTriangle(32, 32, 32 + Math.cos(a - 0.2) * 20, 32 + Math.sin(a - 0.2) * 20, 32 + Math.cos(a) * (28 + (i % 3) * 3), 32 + Math.sin(a) * (28 + (i % 3) * 3));
  }
}

function iconSupplies(g: G): void {
  g.fillStyle(Palette.uiAmber, 1).fillRoundedRect(2, 6, 20, 14, 2);
  g.fillStyle(Palette.uiPanel, 1).fillRect(2, 11, 20, 2.5).fillRect(10.5, 6, 3, 14);
}

function iconIntegrity(g: G): void {
  g.fillStyle(Palette.fdcAccent, 1).fillPoints(v2([{ x: 12, y: 2 }, { x: 21, y: 6 }, { x: 19, y: 16 }, { x: 12, y: 22 }, { x: 5, y: 16 }, { x: 3, y: 6 }]), true);
  g.fillStyle(Palette.uiPanel, 1).fillRect(10.5, 7, 3, 10);
}

function iconWave(g: G): void {
  g.fillStyle(Palette.choirBody, 1).fillEllipse(12, 12, 18, 14);
  g.fillStyle(Palette.choirCore, 1).fillCircle(12, 12, 3.5);
}

/** Generate every placeholder texture. Call once from the Boot scene. */
export function generatePlaceholderArt(scene: Phaser.Scene): void {
  generateFxArt(scene);
  for (const [id, look] of Object.entries(SoldierLooks)) {
    bake(scene, id, SOLDIER_W, SOLDIER_H, (g) => drawSoldier(g, look));
    ART_ORIGINS[id] = SOLDIER_ORIGIN;
  }
  bake(scene, 'unit.trooper', SOLDIER_W, SOLDIER_H, (g) => drawSoldier(g, SoldierLooks['unit.rifle']));
  ART_ORIGINS['unit.trooper'] = SOLDIER_ORIGIN;
  bake(scene, 'unit.turret', 32, 32, turret);
  bake(scene, 'enemy.veilstalker', 36, 28, veilstalker);
  bake(scene, 'enemy.skyray', 48, 40, skyray);
  bake(scene, 'enemy.tender', 34, 34, tender);
  bake(scene, 'enemy.broodbarge', 80, 56, broodbarge);
  bake(scene, 'enemy.colossus', 100, 100, colossus);
  bake(scene, 'bld.sensor', 32, 32, sensor);
  bake(scene, 'bld.depot', 64, 64, depot);
  bake(scene, 'bld.reactor', 64, 64, reactor);
  bake(scene, 'fx.mark', 24, 24, (g) => {
    g.lineStyle(2, 0xff4a3a, 1).strokeCircle(12, 12, 7);
    g.lineBetween(12, 1, 12, 7).lineBetween(12, 17, 12, 23).lineBetween(1, 12, 7, 12).lineBetween(17, 12, 23, 12);
  });
  bake(scene, 'fx.stun', 24, 12, (g) => {
    g.fillStyle(0xffe066, 1);
    for (const x of [4, 12, 20]) g.fillTriangle(x, 1, x + 2.5, 6, x - 2.5, 6).fillTriangle(x, 11, x + 2.5, 6, x - 2.5, 6);
  });
  bake(scene, 'enemy.warden', 32, 32, warden);
  bake(scene, 'enemy.ironback', 48, 48, ironback);
  bake(scene, 'cover.trench', 64, 36, trench);
  bake(scene, 'cover.ruins', 64, 64, ruins);
  bake(scene, 'cover.bunker', 60, 60, bunker);
  bake(scene, 'prop.gate', 40, 140, gate);
  bake(scene, 'prop.floodlight', 24, 24, floodlight);
  bake(scene, 'prop.crate', 24, 24, crate);
  bake(scene, 'prop.wreck', 64, 40, wreck);
  bake(scene, 'fx.shell', 12, 8, shell);
  bake(scene, 'fx.flag', 24, 32, flag);
  bake(scene, 'fx.ring', 64, 64, ring);
  bake(scene, 'fx.shieldBubble', 64, 64, shieldBubble);
  bake(scene, 'fx.scorch', 64, 64, scorch);
  bake(scene, 'icon.supplies', 24, 24, iconSupplies);
  bake(scene, 'icon.integrity', 24, 24, iconIntegrity);
  bake(scene, 'icon.wave', 24, 24, iconWave);
  bake(scene, 'icon.power', 24, 24, (g) => {
    g.fillStyle(0x9fe8ff, 1).fillTriangle(14, 1, 5, 13, 12, 13).fillTriangle(10, 23, 19, 10, 12, 10);
  });
  bake(scene, 'icon.cap', 24, 24, (g) => {
    g.fillStyle(Palette.uiText, 1);
    for (const [x, y] of [[7, 9], [17, 9], [12, 16]]) {
      g.fillCircle(x, y - 3, 3);
      g.fillRoundedRect(x - 4, y + 1, 8, 5, 2);
    }
  });
  bake(scene, 'enemy.skitter', 28, 28, skitter);
  bake(scene, 'cover.sandbags', 40, 60, sandbags);
  radialTexture(scene, 'fx.shadow', 64, '0,0,0', [[0, 0.6], [0.5, 0.4], [1, 0]]);
  radialTexture(scene, 'fx.light', 256, '255,255,255', [[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]);
  radialTexture(scene, 'fx.soft', 64, '255,255,255', [[0, 1], [0.4, 0.6], [1, 0]]);
  bake(scene, 'fx.muzzle', 24, 16, muzzleFlash);
  bake(scene, 'fx.bolt', 32, 4, (g) => {
    g.fillStyle(0xff4fd8, 0.3).fillRect(0, 0, 18, 4);
    g.fillStyle(0xffb0f0, 1).fillRect(14, 1, 18, 2);
  });
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
