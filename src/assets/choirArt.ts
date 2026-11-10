/** Placeholder art for the M3 Choir enemies and the Sensor Pylon. All facing RIGHT. */
import Phaser from 'phaser';
import { Palette } from './palette';

type G = Phaser.GameObjects.Graphics;
const V = (pts: [number, number][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));

/** 36×28 Veilstalker: lean mantis-like hunter with blade arms and a slit visor. */
export function veilstalker(g: G): void {
  g.lineStyle(1.6, 0x2a1f3a, 1);
  for (const s of [-1, 1]) {
    g.lineBetween(12, 14, 6, 14 + s * 9).lineBetween(16, 14, 13, 14 + s * 10); // legs
  }
  g.fillStyle(0x3a2c55, 1).fillEllipse(15, 14, 18, 9); // thorax
  g.fillStyle(0x52407a, 1).fillEllipse(14, 14, 10, 6);
  // Blade arms reaching forward.
  for (const s of [-1, 1]) {
    g.lineStyle(2.4, 0x2a1f3a, 1).lineBetween(19, 14 + s * 3, 25, 14 + s * 8);
    g.fillStyle(0xbfb8d8, 1).fillPoints(V([[24, 14 + s * 7], [35, 14 + s * 3], [25, 14 + s * 9.5]]), true);
  }
  g.fillStyle(0x2a1f3a, 1).fillEllipse(25, 14, 7, 6); // head
  g.fillStyle(0x9a7aff, 1).fillRect(26.5, 12.6, 3, 2.8); // slit eye
}

/** 48×40 Skyray: manta-like flier. */
export function skyray(g: G): void {
  g.fillStyle(Palette.choirShell, 1).fillPoints(V([[30, 20], [14, 2], [6, 6], [12, 20], [6, 34], [14, 38]]), true); // wings
  g.fillStyle(Palette.choirBody, 1).fillPoints(V([[32, 20], [16, 6], [12, 9], [16, 20], [12, 31], [16, 34]]), true);
  g.lineStyle(1, 0x200815, 0.8);
  for (const y of [10, 15, 25, 30]) g.lineBetween(16, y, 28, 20);
  g.fillStyle(0x7a2462, 1).fillEllipse(26, 20, 16, 8); // body
  g.lineStyle(2, Palette.choirShell, 1).lineBetween(18, 20, 1, 20); // tail
  g.fillStyle(Palette.choirCore, 1).fillCircle(30, 20, 2.4).fillCircle(24, 20, 1.4);
}

/** 34×34 Tender: bulbous healer with a glowing sac and tendrils. */
export function tender(g: G): void {
  g.lineStyle(1.6, Palette.choirShell, 1);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8;
    g.lineBetween(14, 17, 14 + Math.cos(a) * 15, 17 + Math.sin(a) * 15);
  }
  g.fillStyle(Palette.choirShell, 1).fillEllipse(16, 17, 20, 18);
  g.fillStyle(0xd0a040, 0.9).fillEllipse(15, 17, 13, 12); // healing sac
  g.fillStyle(0xffe08a, 1).fillEllipse(14, 16, 6, 5);
  g.fillStyle(Palette.choirBody, 1).fillEllipse(26, 17, 9, 8); // head
  g.fillStyle(Palette.choirCore, 1).fillCircle(28, 17, 1.6);
}

/** 80×56 Brood Barge: organic dropship with brood pods. */
export function broodbarge(g: G): void {
  g.fillStyle(0x3a1030, 1).fillEllipse(40, 28, 76, 44); // hull shadow rim
  g.fillStyle(Palette.choirShell, 1).fillEllipse(40, 28, 72, 40);
  g.fillStyle(Palette.choirBody, 1).fillEllipse(44, 28, 54, 26);
  g.fillStyle(0x4b4552, 1);
  for (let i = 0; i < 4; i++) g.fillEllipse(22 + i * 11, 28, 8, 34 - i * 4); // armor ribs
  // Pods
  for (const [x, y] of [[26, 12], [38, 10], [50, 12], [26, 44], [38, 46], [50, 44]] as const) {
    g.fillStyle(0x7a2462, 1).fillCircle(x, y, 4.4);
    g.fillStyle(Palette.choirCore, 0.9).fillCircle(x, y, 1.8);
  }
  g.fillStyle(Palette.choirBody, 1).fillEllipse(70, 28, 16, 16); // prow
  g.fillStyle(Palette.choirCore, 1).fillCircle(74, 28, 3);
  g.fillStyle(0xff8a3a, 0.9).fillCircle(5, 20, 3).fillCircle(5, 36, 3); // engines
}

/** 100×100 Colossus Strider: giant armored walker. */
export function colossus(g: G): void {
  // Legs
  g.lineStyle(7, 0x221a24, 1);
  for (const [x, y] of [[78, 18], [78, 82], [22, 14], [22, 86]] as const) g.lineBetween(50, 50, x, y);
  for (const [x, y] of [[78, 18], [78, 82], [22, 14], [22, 86]] as const) {
    g.fillStyle(0x3a3240, 1).fillCircle(x, y, 7);
    g.fillStyle(0x5a5262, 1).fillCircle(x - 1, y - 1, 3.5);
  }
  // Carapace
  g.fillStyle(0x1a1520, 1).fillEllipse(50, 50, 66, 58);
  g.fillStyle(0x4b4552, 1).fillEllipse(48, 50, 60, 52);
  g.lineStyle(1.6, 0x1a1720, 1);
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0x5a5466, 1).fillEllipse(26 + i * 9, 50, 14, 46 - i * 5);
    g.strokeEllipse(26 + i * 9, 50, 14, 46 - i * 5);
  }
  // Glowing vents and core
  g.fillStyle(Palette.choirCore, 0.9);
  for (const y of [30, 40, 60, 70]) g.fillCircle(34, y, 2.2);
  g.fillStyle(Palette.choirBody, 1).fillEllipse(80, 50, 22, 24); // head
  g.fillStyle(0x2c1022, 1).fillEllipse(84, 50, 10, 16);
  g.fillStyle(Palette.choirCore, 1).fillCircle(88, 50, 4);
  g.fillStyle(0xffffff, 0.8).fillCircle(89, 49, 1.4);
}

/** 32×32 Sensor Pylon: mast with a radar dish. */
export function sensor(g: G): void {
  const hex: [number, number][] = [];
  for (let i = 0; i < 6; i++) hex.push([16 + Math.cos((i / 6) * Math.PI * 2) * 12, 16 + Math.sin((i / 6) * Math.PI * 2) * 12]);
  g.fillStyle(0x2a2c28, 1).fillPoints(V(hex), true);
  g.lineStyle(1.2, 0x9a7aff, 0.9).strokePoints(V(hex), true);
  g.fillStyle(0x5d6b78, 1).fillCircle(16, 16, 7);
  g.fillStyle(0xc9d3dc, 1).fillEllipse(22, 16, 6, 14); // dish
  g.fillStyle(0x3a4550, 1).fillRect(14, 15, 8, 2);
  g.fillStyle(0x9a7aff, 1).fillCircle(16, 16, 2.4);
}
