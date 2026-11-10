/**
 * Placeholder art for Motor Pool vehicles (hull + separate rotating turret) and commander-power
 * props. All facing RIGHT. Turret pivots and muzzle points are listed in VEHICLE_POINTS.
 */
import Phaser from 'phaser';
import { Palette } from './palette';

type G = Phaser.GameObjects.Graphics;
const V = (pts: [number, number][]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));

const STEEL = 0x56636e, STEEL_D = 0x34404a, STEEL_L = 0x7d8a96, OLIVE = 0x5a6650, OLIVE_D = 0x3a4436;

/** 48×32 armored car hull with six wheels. */
export function carHull(g: G): void {
  g.fillStyle(0x15181b, 1);
  for (const x of [10, 22, 34]) g.fillRoundedRect(x - 4, 1, 9, 6, 2).fillRoundedRect(x - 4, 25, 9, 6, 2);
  g.fillStyle(STEEL_D, 1).fillPoints(V([[4, 8], [38, 5], [46, 12], [46, 20], [38, 27], [4, 24]]), true);
  g.fillStyle(STEEL, 1).fillPoints(V([[7, 10], [36, 8], [42, 13], [42, 19], [36, 24], [7, 22]]), true);
  g.fillStyle(0x1a2a33, 1).fillRect(38, 11, 4, 10); // windscreen slit
  g.fillStyle(Palette.uiAmber, 1).fillRect(8, 9, 2, 14); // stripe
  g.fillStyle(0xfff2c4, 1).fillRect(44, 10, 2, 2.5).fillRect(44, 19.5, 2, 2.5); // headlights
}

/** 40×20 autocannon turret, pivot (12, 10). */
export function carTurret(g: G): void {
  g.fillStyle(0x15181b, 1).fillRect(18, 7.4, 20, 2.2).fillRect(18, 10.4, 20, 2.2); // twin barrels
  g.fillStyle(0x0d0f10, 1).fillRect(36, 6.8, 3, 6.4);
  g.fillStyle(STEEL_D, 1).fillCircle(12, 10, 8);
  g.fillStyle(STEEL_L, 1).fillCircle(12, 10, 6.4);
  g.fillStyle(STEEL, 1).fillRect(10, 5.5, 9, 9);
  g.fillStyle(Palette.fdcAccent, 1).fillRect(16, 7, 2, 2);
}

/** 60×40 siege tank hull with tracks. */
export function tankHull(g: G): void {
  for (const y of [2, 30]) {
    g.fillStyle(0x15181b, 1).fillRoundedRect(2, y, 56, 8, 3);
    g.lineStyle(1, 0x2c3034, 1);
    for (let x = 5; x < 57; x += 4) g.lineBetween(x, y + 1, x, y + 7);
  }
  g.fillStyle(OLIVE_D, 1).fillRoundedRect(4, 8, 52, 24, 4);
  g.fillStyle(OLIVE, 1).fillRoundedRect(6, 10, 48, 20, 3);
  g.fillStyle(0x2c3529, 1).fillRect(7, 13, 10, 14); // engine deck
  g.lineStyle(1, 0x1a1f18, 1);
  for (let y = 14; y < 27; y += 3) g.lineBetween(8, y, 16, y);
  g.fillStyle(Palette.uiAmber, 1).fillRect(50, 10, 2, 20);
}

/** 56×28 siege cannon turret, pivot (18, 14). */
export function tankTurret(g: G): void {
  g.fillStyle(0x15181b, 1).fillRect(26, 11.6, 26, 4.8); // long barrel
  g.fillStyle(0x0d0f10, 1).fillRect(50, 9.5, 5, 9); // muzzle brake
  g.fillStyle(0x2a2f28, 1).fillRect(36, 11, 4, 6); // fume extractor
  g.fillStyle(OLIVE_D, 1).fillPoints(V([[6, 4], [26, 3], [32, 9], [32, 19], [26, 25], [6, 24], [3, 14]]), true);
  g.fillStyle(OLIVE, 1).fillPoints(V([[8, 6], [24, 5.5], [29, 10], [29, 18], [24, 22.5], [8, 22], [6, 14]]), true);
  g.fillStyle(0x2c3529, 1).fillCircle(14, 10, 3).fillCircle(14, 18, 2.4); // hatches
  g.fillStyle(Palette.fdcAccent, 1).fillRect(26, 8, 2, 2);
}

/** 44×44 AA walker hull: hips and two big feet. */
export function walkerHull(g: G): void {
  for (const y of [6, 38]) {
    g.lineStyle(5, 0x2c3034, 1).lineBetween(22, 22, 26, y);
    g.fillStyle(STEEL_D, 1).fillRoundedRect(19, y - 5, 16, 10, 3);
    g.fillStyle(STEEL, 1).fillRoundedRect(21, y - 3.5, 11, 7, 2);
  }
  g.fillStyle(STEEL_D, 1).fillRoundedRect(12, 13, 20, 18, 4);
  g.fillStyle(Palette.uiAmber, 1).fillRect(13, 14, 2, 16);
}

/** 40×32 AA turret (cockpit + twin flak pods), pivot (14, 16). */
export function walkerTurret(g: G): void {
  for (const y of [5, 23]) {
    g.fillStyle(STEEL_D, 1).fillRoundedRect(10, y - 4, 16, 8, 2); // pod
    g.fillStyle(0x15181b, 1);
    for (const dy of [-2, 1.2]) g.fillRect(24, y + dy, 13, 1.6); // barrels
  }
  g.fillStyle(STEEL_D, 1).fillCircle(14, 16, 9);
  g.fillStyle(STEEL_L, 1).fillCircle(14, 16, 7.4);
  g.fillStyle(0x0b1418, 1).fillEllipse(19, 16, 5, 9);
  g.fillStyle(Palette.fdcAccent, 1).fillEllipse(19.5, 16, 3, 7);
}

/** 40×40 jet silhouette (used as the airstrike's passing shadow). */
export function jet(g: G): void {
  g.fillStyle(0xffffff, 1).fillPoints(V([[38, 20], [22, 17], [10, 3], [6, 3], [12, 17], [2, 18], [0, 14], [-1, 20], [0, 26], [2, 22], [12, 23], [6, 37], [10, 37], [22, 23]]), true);
}

/** 20×20 drop pod (top view). */
export function pod(g: G): void {
  const hex: [number, number][] = [];
  for (let i = 0; i < 6; i++) hex.push([10 + Math.cos((i / 6) * Math.PI * 2 + 0.52) * 8.5, 10 + Math.sin((i / 6) * Math.PI * 2 + 0.52) * 8.5]);
  g.fillStyle(STEEL_D, 1).fillPoints(V(hex), true);
  g.fillStyle(STEEL, 1).fillCircle(10, 10, 6);
  g.lineStyle(1.5, Palette.uiAmber, 1).strokeCircle(10, 10, 6);
  g.fillStyle(Palette.fdcAccent, 1).fillCircle(10, 10, 2);
  g.fillStyle(0x15181b, 1);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.fillRect(10 + Math.cos(a) * 8 - 1.5, 10 + Math.sin(a) * 8 - 1.5, 3, 3);
  }
}

/** Turret pivots (design units) and gun points for vehicle weapons. */
export const VEHICLE_POINTS: Record<string, { w: number; h: number; pivot: [number, number]; muzzles: [number, number][]; eject: [number, number] }> = {
  'veh.car.turret': { w: 40, h: 20, pivot: [12, 10], muzzles: [[39, 8.5], [39, 11.5]], eject: [14, 4] },
  'veh.tank.turret': { w: 56, h: 28, pivot: [18, 14], muzzles: [[55, 14]], eject: [10, 6] },
  'veh.walker.turret': { w: 40, h: 32, pivot: [14, 16], muzzles: [[37, 3.8], [37, 24.2], [37, 7], [37, 21]], eject: [18, 9] },
};
