/** Placeholder art for buildings and turrets (drawn in design units; see placeholderArt.ts). */
import Phaser from 'phaser';
import { Palette } from './palette';

type G = Phaser.GameObjects.Graphics;
const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));

/** 64×64 Supply Depot: landing pad, container and crates. */
export function depot(g: G): void {
  g.fillStyle(0x2a2c28, 1).fillRoundedRect(4, 4, 56, 56, 6);
  g.lineStyle(2, Palette.uiAmber, 0.9).strokeRoundedRect(7, 7, 50, 50, 5);
  g.lineStyle(1.5, Palette.uiAmber, 0.5);
  for (let i = 0; i < 6; i++) g.lineBetween(8 + i * 8, 58, 14 + i * 8, 52); // hazard edge
  g.fillStyle(0x3d5a6b, 1).fillRect(12, 12, 26, 14); // container
  g.lineStyle(1, 0x24343e, 1);
  for (let x = 14; x < 38; x += 3) g.lineBetween(x, 12, x, 26);
  g.fillStyle(0x5b5a3c, 1).fillRect(40, 14, 11, 11).fillRect(14, 34, 11, 11).fillRect(27, 36, 9, 9);
  g.lineStyle(1, 0x3a392a, 1).strokeRect(40, 14, 11, 11).strokeRect(14, 34, 11, 11).strokeRect(27, 36, 9, 9);
  g.fillStyle(Palette.uiAmber, 1).fillCircle(47, 47, 6);
  g.fillStyle(0x2a2c28, 1).fillRect(44, 46, 6, 2).fillRect(46, 44, 2, 6);
}

/** 64×64 Reactor: armored ring with a glowing core and cooling fins. */
export function reactor(g: G): void {
  g.fillStyle(0x2a2c28, 1).fillCircle(32, 32, 29);
  g.fillStyle(0x45494c, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    g.fillPoints(v2([[32 + c * 20 - s * 4, 32 + s * 20 + c * 4], [32 + c * 29 - s * 4, 32 + s * 29 + c * 4], [32 + c * 29 + s * 4, 32 + s * 29 - c * 4], [32 + c * 20 + s * 4, 32 + s * 20 - c * 4]]), true);
  }
  g.fillStyle(0x5a5f63, 1).fillCircle(32, 32, 19);
  g.lineStyle(2, Palette.uiAmber, 0.9).strokeCircle(32, 32, 19);
  g.fillStyle(0x0d2a33, 1).fillCircle(32, 32, 13);
  g.fillStyle(Palette.fdcAccent, 0.9).fillCircle(32, 32, 9);
  g.fillStyle(0xcff8ff, 1).fillCircle(32, 32, 4.5);
}

/** 32×32 auto-turret on a hex base, gun facing right. */
export function turret(g: G): void {
  const hex: [number, number][] = [];
  for (let i = 0; i < 6; i++) hex.push([16 + Math.cos((i / 6) * Math.PI * 2) * 11, 16 + Math.sin((i / 6) * Math.PI * 2) * 11]);
  g.fillStyle(0x3a3d38, 1).fillPoints(v2(hex), true);
  g.lineStyle(1.2, Palette.uiAmber, 0.9).strokePoints(v2(hex), true);
  g.fillStyle(0x1d2124, 1).fillRect(16, 13.5, 15, 2).fillRect(16, 16.5, 15, 2);
  g.fillStyle(0x5d6b78, 1).fillCircle(15, 16, 6.5);
  g.fillStyle(Palette.fdcAccent, 1).fillCircle(18.5, 16, 1.6);
}
