/**
 * Textures for visual effects: muzzle flashes, casings, debris, fireballs, smoke, tracers.
 * Soft/glowing ones are painted on a canvas with gradients (no banding); hard-edged ones use
 * vector Graphics. All flashes point RIGHT with their origin on the left edge (the muzzle).
 */
import Phaser from 'phaser';

type Ctx = CanvasRenderingContext2D;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: Ctx) => void, marginLeft = 0): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w + marginLeft, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.translate(marginLeft, 0);
  paint(ctx);
  tex.refresh();
  if (marginLeft) FLASH_ORIGIN[key] = marginLeft / (w + marginLeft);
}

/**
 * Muzzle flashes have room painted behind the muzzle (so glows aren't clipped). This is the
 * horizontal origin (0–1) that puts the muzzle point on the gun.
 */
export const FLASH_ORIGIN: Record<string, number> = {};

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A soft flame "petal": an ellipse with a hot core, stretched along +x from (x, y). */
function petal(ctx: Ctx, x: number, y: number, len: number, wid: number, angle: number, core = 'rgba(255,255,255,1)', mid = 'rgba(255,214,120,0.95)', edge = 'rgba(255,130,40,0)'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1, wid / len);
  const g = ctx.createRadialGradient(len * 0.25, 0, 0, len * 0.25, 0, len);
  g.addColorStop(0, core);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(len * 0.45, 0, len * 0.6, len * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Muzzle-flash variants. 96×48 px, muzzle at (4, 24), flash pointing right. */
function flashCone(ctx: Ctx, seed: number): void {
  const rnd = (i: number) => {
    const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  ctx.globalCompositeOperation = 'lighter';
  radial(ctx, 10, 24, 22, [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,170,60,0)']]);
  petal(ctx, 4, 24, 70 + rnd(1) * 20, 16, (rnd(2) - 0.5) * 0.12);
  petal(ctx, 6, 24, 34 + rnd(3) * 14, 10, -0.55 - rnd(4) * 0.25);
  petal(ctx, 6, 24, 34 + rnd(5) * 14, 10, 0.55 + rnd(6) * 0.25);
  if (seed % 2 === 0) petal(ctx, 8, 24, 22, 8, (rnd(7) - 0.5) * 2.2);
  radial(ctx, 8, 24, 8, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
}

export function generateFxArt(scene: Phaser.Scene): void {
  for (let i = 0; i < 3; i++) canvas(scene, `fx.mf.cone${i}`, 96, 48, (c) => flashCone(c, i + 1), 28);

  // Shotgun / flamer: wide fan.
  canvas(scene, 'fx.mf.wide', 96, 64, (c) => {
    c.globalCompositeOperation = 'lighter';
    for (const a of [-0.45, -0.22, 0, 0.22, 0.45]) petal(c, 4, 32, 58 - Math.abs(a) * 40, 16, a);
    radial(c, 8, 32, 12, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  }, 24);

  // Sniper / anti-materiel: long blast plus muzzle-brake side jets.
  canvas(scene, 'fx.mf.brake', 128, 96, (c) => {
    c.globalCompositeOperation = 'lighter';
    radial(c, 14, 48, 34, [[0, 'rgba(255,240,210,0.9)'], [1, 'rgba(255,160,60,0)']]);
    petal(c, 6, 48, 110, 20, 0);
    petal(c, 12, 48, 30, 11, -1.35);
    petal(c, 12, 48, 30, 11, 1.35);
    petal(c, 10, 48, 20, 8, -2.3, 'rgba(255,255,255,0.7)', 'rgba(220,220,220,0.4)', 'rgba(160,160,160,0)');
    petal(c, 10, 48, 20, 8, 2.3, 'rgba(255,255,255,0.7)', 'rgba(220,220,220,0.4)', 'rgba(160,160,160,0)');
    radial(c, 10, 48, 12, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  }, 40);

  // Grenade launcher / rocket: round thump with a short cone.
  canvas(scene, 'fx.mf.thump', 96, 96, (c) => {
    c.globalCompositeOperation = 'lighter';
    radial(c, 26, 48, 40, [[0, 'rgba(255,250,230,1)'], [0.35, 'rgba(255,190,90,0.8)'], [1, 'rgba(255,90,20,0)']]);
    petal(c, 10, 48, 70, 30, 0);
    for (const a of [-0.9, 0.9]) petal(c, 14, 48, 26, 12, a);
  }, 24);

  // Rocket back-blast (points right; we rotate it backwards).
  canvas(scene, 'fx.mf.backblast', 128, 64, (c) => {
    c.globalCompositeOperation = 'lighter';
    petal(c, 4, 32, 120, 46, 0, 'rgba(255,250,220,1)', 'rgba(255,170,70,0.75)', 'rgba(180,90,40,0)');
  }, 16);

  // Alien plasma flare.
  canvas(scene, 'fx.mf.plasma', 64, 64, (c) => {
    c.globalCompositeOperation = 'lighter';
    radial(c, 32, 32, 30, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,140,240,0.9)'], [1, 'rgba(200,40,180,0)']]);
  });
  FLASH_ORIGIN['fx.mf.plasma'] = 0.5;

  // Tracers: bright head on the right, fading tail to the left. Tinted per weapon.
  canvas(scene, 'fx.tracer2', 128, 8, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.fillRect(0, 2.5, 128, 3);
    const h = c.createRadialGradient(122, 4, 0, 122, 4, 6);
    h.addColorStop(0, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h;
    c.fillRect(110, 0, 18, 8);
  });

  // Fireball and smoke puffs.
  canvas(scene, 'fx.fireball', 64, 64, (c) => {
    radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.85)'], [0.7, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
  });
  canvas(scene, 'fx.smoke', 64, 64, (c) => {
    // Lumpy cloud: several overlapping soft blobs.
    const blobs: [number, number, number][] = [[32, 32, 24], [22, 28, 16], [42, 26, 15], [28, 42, 15], [42, 40, 14]];
    for (const [x, y, r] of blobs) radial(c, x, y, r, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  });
  canvas(scene, 'fx.ember', 8, 8, (c) => radial(c, 4, 4, 4, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,220,150,0.9)'], [1, 'rgba(255,120,40,0)']]));
  canvas(scene, 'fx.mote', 8, 8, (c) => radial(c, 4, 4, 4, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]));

  // Hard-edged bits (vector, drawn at 3×).
  const bake = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({}, false);
    g.scaleCanvas(3, 3);
    draw(g);
    g.generateTexture(key, w * 3, h * 3);
    g.destroy();
  };
  bake('fx.casing', 4, 2, (g) => {
    g.fillStyle(0xc9a43a, 1).fillRect(0, 0, 4, 2);
    g.fillStyle(0xffe08a, 1).fillRect(0.5, 0.2, 3, 0.6);
    g.fillStyle(0x8a6a1a, 1).fillRect(3.2, 0, 0.8, 2);
  });
  bake('fx.casing.big', 7, 3, (g) => {
    g.fillStyle(0xb8932f, 1).fillRect(0, 0, 7, 3);
    g.fillStyle(0xffe08a, 1).fillRect(0.6, 0.4, 5.4, 0.8);
    g.fillStyle(0x7a5a14, 1).fillRect(6, 0, 1, 3);
  });
  bake('fx.casing.shell', 6, 4, (g) => {
    g.fillStyle(0x6f7a5a, 1).fillRoundedRect(0, 0, 6, 4, 1.2);
    g.fillStyle(0xc9a43a, 1).fillRect(4.6, 0, 1.4, 4);
  });
  bake('fx.link', 3, 3, (g) => {
    g.lineStyle(0.8, 0x9aa3aa, 1).strokeRect(0.4, 0.4, 2.2, 2.2);
  });
  bake('fx.chunk', 6, 5, (g) => {
    g.fillStyle(0x3a352b, 1).fillPoints([0, 2, 2, 0, 5, 1, 6, 4, 2, 5].reduce<Phaser.Math.Vector2[]>((a, v, i, arr) => (i % 2 ? a : [...a, new Phaser.Math.Vector2(v, arr[i + 1])]), []), true);
    g.fillStyle(0x5a5243, 1).fillCircle(3, 2, 1);
  });
  bake('fx.gib', 6, 5, (g) => {
    g.fillStyle(0x9b2f7a, 1).fillEllipse(3, 2.5, 6, 4);
    g.fillStyle(0x5a1747, 1).fillEllipse(2.2, 2, 3, 2.4);
    g.fillStyle(0xffb238, 0.9).fillCircle(4, 2.8, 0.7);
  });
  bake('fx.plate', 10, 8, (g) => {
    g.fillStyle(0x4b4552, 1).fillEllipse(5, 4, 10, 7);
    g.lineStyle(0.8, 0x1a1720, 1).strokeEllipse(5, 4, 10, 7);
    g.fillStyle(0x6a6372, 1).fillEllipse(4, 3, 4, 2);
  });
  bake('fx.pock', 6, 6, (g) => {
    g.fillStyle(0x15140f, 0.7).fillCircle(3, 3, 2.2);
    g.fillStyle(0x15140f, 0.35).fillCircle(3, 3, 3);
  });
  bake('icon.orbital', 24, 24, (g) => {
    g.lineStyle(2, 0xff5a3a, 1).strokeCircle(12, 12, 8);
    g.lineBetween(12, 1, 12, 7).lineBetween(12, 17, 12, 23).lineBetween(1, 12, 7, 12).lineBetween(17, 12, 23, 12);
    g.fillStyle(0xffffff, 1).fillCircle(12, 12, 2.4);
  });
  bake('icon.emp', 24, 24, (g) => {
    g.fillStyle(0x6fc8ff, 1).fillPoints([[14, 1], [5, 13], [11, 13], [9, 23], [19, 9], [13, 9], [16, 1]].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  });
  bake('fx.hexring', 32, 32, (g) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) pts.push(new Phaser.Math.Vector2(16 + Math.cos((i / 6) * Math.PI * 2) * 13, 16 + Math.sin((i / 6) * Math.PI * 2) * 13));
    g.lineStyle(2, 0xffffff, 1).strokePoints(pts, true);
    g.lineStyle(1, 0xffffff, 0.5);
    for (const p of pts) g.lineBetween(16, 16, p.x, p.y);
  });
}
