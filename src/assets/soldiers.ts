/**
 * FDC marine placeholder art: top-down armored soldiers with helmets, pauldrons, arms gripping
 * their weapons, and role-specific kit. All drawn facing RIGHT in a 40×28 box; the body center
 * (the point the sprite rotates around) is at (12, 14) → origin (0.3, 0.5).
 */
import Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;

export type WeaponKind =
  | 'carbine' | 'dmr' | 'shotgun' | 'launcher' | 'rocket' | 'gatling'
  | 'sniper' | 'amr' | 'binocs' | 'tool' | 'smg' | 'medkit';
export type PackKind = 'pack' | 'tank' | 'ammo' | 'radio' | 'tools' | 'medic' | 'belt' | 'none';

export interface SoldierLook {
  weapon: WeaponKind;
  pack: PackKind;
  armor: number;
  armorDark: number;
  accent: number;
  helmet?: number;
  hood?: boolean;
  lamp?: boolean;
  cross?: boolean;
  stripes?: boolean;
}

export const SOLDIER_W = 40;
export const SOLDIER_H = 28;
export const SOLDIER_ORIGIN = { x: 12 / 40, y: 0.5 };

const GUN = 0x1d2124;
const GUN_LIGHT = 0x3a4147;
const GLOVE = 0x22272b;
const VISOR = 0x47e0ff;

function lighten(c: number, k: number): number {
  const r = Math.min(255, ((c >> 16) & 255) + k), g = Math.min(255, ((c >> 8) & 255) + k), b = Math.min(255, (c & 255) + k);
  return (r << 16) | (g << 8) | b;
}

/** A limb as a thick segment with rounded joints. */
function limb(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: number): void {
  g.lineStyle(w, color, 1).lineBetween(x0, y0, x1, y1);
  g.fillStyle(color, 1).fillCircle(x0, y0, w / 2).fillCircle(x1, y1, w / 2);
}

function pack(g: G, look: SoldierLook): void {
  const d = look.armorDark;
  switch (look.pack) {
    case 'pack':
      g.fillStyle(d, 1).fillRoundedRect(3, 8.5, 7, 11, 2);
      g.fillStyle(lighten(d, 18), 1).fillRect(4, 10, 2, 8);
      break;
    case 'tank': // twin fuel tanks + hose to the weapon
      g.fillStyle(0x8a3b14, 1).fillRoundedRect(1.5, 7, 6, 6.5, 3).fillRoundedRect(1.5, 14.5, 6, 6.5, 3);
      g.fillStyle(0xff8a3a, 1).fillRoundedRect(2.5, 8, 4, 2, 1).fillRoundedRect(2.5, 15.5, 4, 2, 1);
      g.lineStyle(1.3, 0x2a2a2a, 1).beginPath().moveTo(5, 18).lineTo(9, 22).lineTo(15, 21).strokePath();
      break;
    case 'ammo':
      g.fillStyle(0x4f4a33, 1).fillRoundedRect(2, 7.5, 8.5, 13, 2);
      g.fillStyle(0x6b6445, 1).fillRect(3, 9, 6.5, 2).fillRect(3, 13, 6.5, 2).fillRect(3, 17, 6.5, 2);
      break;
    case 'belt': // ammo drum + belt feeding the gatling
      g.fillStyle(0x4f4a33, 1).fillRoundedRect(2, 7.5, 8, 13, 2);
      g.lineStyle(2.2, 0xc9a43a, 1).beginPath().moveTo(7, 19).lineTo(11, 22.5).lineTo(19, 21).strokePath();
      g.lineStyle(0.8, 0x6b5a1f, 1);
      for (let i = 0; i < 5; i++) g.lineBetween(8 + i * 2.2, 20 + (i < 2 ? i * 1.2 : 2.2 - (i - 2) * 0.4), 8.6 + i * 2.2, 21.8 + (i < 2 ? i * 1.2 : 2.2 - (i - 2) * 0.4));
      break;
    case 'radio':
      g.fillStyle(d, 1).fillRoundedRect(3, 8.5, 7, 11, 2);
      g.fillStyle(0x2e3a2e, 1).fillRect(4, 10, 5, 6);
      g.lineStyle(1, 0x111111, 1).lineBetween(5, 9, 0.5, 4);
      g.fillStyle(0xff4a3a, 1).fillCircle(0.8, 4.2, 0.9);
      break;
    case 'tools':
      g.fillStyle(0x3a3a34, 1).fillRoundedRect(2.5, 8, 8, 12, 2);
      g.lineStyle(1.2, 0xf2a93b, 1).strokeRoundedRect(2.5, 8, 8, 12, 2);
      g.fillStyle(0x9aa3aa, 1).fillRect(4, 10, 1.2, 8).fillRect(6.5, 10, 1.2, 8);
      break;
    case 'medic':
      g.fillStyle(0xd9dee2, 1).fillRoundedRect(3, 8.5, 7.5, 11, 2);
      g.fillStyle(0x3fbf6a, 1).fillRect(5.9, 10.5, 1.8, 7).fillRect(3.3, 13.1, 7, 1.8);
      break;
    case 'none':
      break;
  }
}

function weapon(g: G, kind: WeaponKind, accent: number): void {
  switch (kind) {
    case 'carbine':
    case 'smg': {
      const len = kind === 'smg' ? 26 : 31;
      g.fillStyle(GUN, 1).fillRect(8, 16.6, 4, 2.2); // stock
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 15.8, 9, 3.6); // receiver
      g.fillStyle(GUN, 1).fillRect(16, 19.2, 2.6, kind === 'smg' ? 4 : 3.2); // magazine
      g.fillStyle(GUN, 1).fillRect(21, 16.6, len - 21, 2); // barrel / handguard
      g.fillStyle(0x0d0f10, 1).fillRect(len - 1, 16.3, 2, 2.6); // muzzle
      g.fillStyle(0x111416, 1).fillRect(14, 16.3, 4.5, 1.6); // optic
      g.fillStyle(accent, 1).fillRect(14.5, 16.6, 1.2, 1); // optic glint
      break;
    }
    case 'dmr': {
      g.fillStyle(GUN, 1).fillRect(7, 16.6, 5, 2.4);
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 15.8, 10, 3.6);
      g.fillStyle(GUN, 1).fillRect(16.5, 19.2, 2.4, 3);
      g.fillStyle(GUN, 1).fillRect(22, 16.8, 13, 1.8);
      g.fillStyle(0x0d0f10, 1).fillRect(34, 16.3, 2.5, 2.8);
      g.fillStyle(0x0f1214, 1).fillRoundedRect(12.5, 15, 9, 2.6, 1); // long scope
      g.fillStyle(accent, 1).fillCircle(21.6, 16.3, 0.8);
      break;
    }
    case 'shotgun': {
      g.fillStyle(GUN, 1).fillRect(8, 16.4, 4, 2.6);
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 15.6, 8, 4);
      g.fillStyle(GUN, 1).fillRect(20, 16.2, 9, 2.8); // thick barrel
      g.fillStyle(0x5a3a1a, 1).fillRect(21.5, 15.8, 4, 3.6); // pump
      g.fillStyle(0x0d0f10, 1).fillRect(28.5, 15.9, 2.2, 3.4);
      // flamer nozzle under the barrel
      g.fillStyle(0x8a3b14, 1).fillRect(20, 19.4, 8, 1.6);
      g.fillStyle(0xff8a3a, 1).fillCircle(28.4, 20.2, 1);
      break;
    }
    case 'launcher': {
      g.fillStyle(0x3d4a3a, 1).fillRoundedRect(7, 15.2, 24, 5.2, 1.5); // tube
      g.fillStyle(0x2c3529, 1).fillRect(7, 15.2, 3, 5.2);
      g.fillStyle(0x1a1f18, 1).fillRect(29, 14.8, 3, 6); // muzzle ring
      g.fillStyle(GUN, 1).fillRect(15, 20.3, 3, 3); // grip
      g.fillStyle(0x111416, 1).fillRect(17, 13.4, 4, 2); // sight
      g.fillStyle(accent, 1).fillRect(18, 13.8, 1.4, 1);
      break;
    }
    case 'rocket': {
      g.fillStyle(0x4a4f3a, 1).fillRoundedRect(3, 14.8, 32, 5.6, 2);
      g.fillStyle(0x2f3326, 1).fillTriangle(3, 14.6, 0, 13.2, 0, 22).fillTriangle(3, 20.6, 0, 22, 3, 14.6);
      g.fillStyle(0xd94a2a, 1).fillCircle(34.5, 17.6, 2.2); // warhead tip
      g.fillStyle(0x111416, 1).fillRect(16, 12.6, 5, 2.4);
      g.fillStyle(accent, 1).fillRect(17, 13, 1.2, 1.2);
      g.fillStyle(0xd94a2a, 1).fillRect(10, 14.8, 1.4, 5.6).fillRect(25, 14.8, 1.4, 5.6); // stripes
      break;
    }
    case 'gatling': {
      g.fillStyle(0x2c3036, 1).fillRoundedRect(9, 14.6, 12, 6.4, 2); // motor housing
      g.fillStyle(GUN, 1);
      for (const y of [15.2, 16.9, 18.6]) g.fillRect(20, y, 15, 1.2); // barrels
      g.fillStyle(0x0d0f10, 1).fillRect(33.5, 14.8, 2, 5.4).fillRect(26, 14.8, 1.4, 5.4); // barrel clamps
      g.fillStyle(0xc9a43a, 1).fillRect(12, 20.6, 4, 2); // feed
      g.fillStyle(accent, 1).fillRect(10, 15.4, 1.5, 1.5);
      break;
    }
    case 'sniper':
    case 'amr': {
      const heavy = kind === 'amr';
      g.fillStyle(GUN, 1).fillRect(5, 16.4, 7, 2.6);
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 15.6, 11, heavy ? 4.4 : 3.8);
      g.fillStyle(GUN, 1).fillRect(23, heavy ? 16.4 : 16.8, 14, heavy ? 2.6 : 1.8);
      g.fillStyle(0x0d0f10, 1).fillRect(36, heavy ? 15.4 : 16.2, heavy ? 3.5 : 2, heavy ? 4.6 : 2.6); // muzzle brake
      g.fillStyle(0x0f1214, 1).fillRoundedRect(12, 14.2, 11, 3, 1.2); // big scope
      g.fillStyle(0x47e0ff, 1).fillCircle(22.6, 15.7, 0.9);
      g.lineStyle(0.9, 0x111111, 1).lineBetween(31, 18.6, 33, 22).lineBetween(31, 16.4, 33, 13); // bipod
      break;
    }
    case 'binocs': {
      // Carbine slung across the back.
      g.lineStyle(2, GUN, 1).lineBetween(4, 22, 14, 5);
      g.fillStyle(0x111416, 1).fillRoundedRect(17, 10.6, 4.5, 2.8, 1).fillRoundedRect(17, 14.6, 4.5, 2.8, 1);
      g.fillStyle(accent, 1).fillRect(21, 11.2, 0.9, 1.6).fillRect(21, 15.2, 0.9, 1.6);
      break;
    }
    case 'tool': {
      g.fillStyle(GUN, 1).fillRect(10, 16.8, 9, 2.2); // SMG (short)
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 16.2, 5, 3.2);
      g.fillStyle(0x0d0f10, 1).fillRect(19, 17, 6, 1.6);
      g.fillStyle(0x9aa3aa, 1).fillRect(18, 9, 7, 1.8); // welder in the other hand
      g.fillStyle(0xffd27a, 1).fillCircle(25.5, 9.9, 1.3);
      break;
    }
    case 'medkit': {
      g.fillStyle(GUN, 1).fillRect(10, 16.8, 9, 2.2);
      g.fillStyle(GUN_LIGHT, 1).fillRect(12, 16.2, 5, 3.2);
      g.fillStyle(0x0d0f10, 1).fillRect(19, 17, 6, 1.6);
      g.fillStyle(0xe8eef2, 1).fillRoundedRect(17.5, 7.5, 5.5, 4.5, 1); // med injector
      g.fillStyle(0x3fbf6a, 1).fillRect(19.6, 8, 1.3, 3.5).fillRect(18.5, 9.1, 3.5, 1.3);
      break;
    }
  }
}

/** Where the two hands go for each weapon type: [front hand, trigger hand]. */
function hands(kind: WeaponKind): [[number, number], [number, number]] {
  switch (kind) {
    case 'launcher': return [[22, 15], [16.5, 20.5]];
    case 'rocket': return [[23, 15], [16, 20.5]];
    case 'gatling': return [[17, 14.5], [13, 21]];
    case 'sniper':
    case 'amr': return [[24, 16.5], [14.5, 19]];
    case 'binocs': return [[18, 11.8], [18, 16.2]];
    case 'tool': return [[18.5, 10], [14, 18.6]];
    case 'medkit': return [[18.5, 10], [14, 18.6]];
    case 'shotgun': return [[22.5, 17.5], [14, 18.8]];
    default: return [[23, 17.6], [14.5, 18.6]];
  }
}

export function drawSoldier(g: G, look: SoldierLook): void {
  const armor = look.armor, dark = look.armorDark;
  pack(g, look);

  // Torso: wide armored shoulders (the y axis is "across the shoulders" when facing right).
  g.fillStyle(0x0b0d0f, 0.9).fillEllipse(11.5, 14, 14.4, 22.4); // outline
  g.fillStyle(dark, 1).fillEllipse(11.5, 14, 13, 21);
  g.fillStyle(armor, 1).fillEllipse(12, 14, 11, 18.5);
  g.fillStyle(lighten(armor, 24), 1).fillEllipse(14, 14, 5, 11); // chest plate
  g.fillStyle(lighten(armor, 40), 0.6).fillEllipse(14.6, 11.5, 2, 3.4); // plate highlight
  if (look.hood) {
    // Ghillie cloak over the shoulders.
    g.fillStyle(0x3d4a2c, 1).fillEllipse(11, 14, 14, 22);
    g.fillStyle(0x51603a, 1);
    for (const [x, y, r] of [[7, 8, 2.6], [9, 19.5, 2.8], [13, 5.5, 2.2], [12, 22.5, 2.4], [6, 14, 2.6], [14.5, 10.5, 2]]) g.fillCircle(x, y, r);
    g.fillStyle(0x2c3820, 1);
    for (const [x, y, r] of [[10, 10, 1.6], [8, 16.5, 1.5], [14, 18, 1.4]]) g.fillCircle(x, y, r);
  }

  weapon(g, look.weapon, look.accent);

  // Arms: shoulder → elbow → gloved hand, outlined so they read against the weapon.
  const [[fx, fy], [tx, ty]] = hands(look.weapon);
  const armC = look.hood ? 0x4a5a36 : armor;
  const foreC = look.hood ? 0x3d4a2c : dark;
  const ex1 = (12 + fx) / 2 + 1, ey1 = (6.5 + fy) / 2 - 1.8;
  const ex2 = (12 + tx) / 2 + 0.5, ey2 = (21.5 + ty) / 2 + 1.2;
  for (const [w, c1, c2] of [[4.6, 0x0b0d0f, 0x0b0d0f], [3.4, armC, foreC]] as const) {
    limb(g, 12, 6.5, ex1, ey1, w, c1);
    limb(g, ex1, ey1, fx, fy, w - 0.4, c2);
    limb(g, 12, 21.5, ex2, ey2, w, c1);
    limb(g, ex2, ey2, tx, ty, w - 0.4, c2);
  }
  g.fillStyle(GLOVE, 1).fillCircle(fx, fy, 1.9).fillCircle(tx, ty, 1.9);
  g.fillStyle(0x3a4147, 1).fillCircle(fx - 0.4, fy - 0.4, 0.8).fillCircle(tx - 0.4, ty - 0.4, 0.8);

  // Pauldrons
  if (!look.hood) {
    for (const py of [6.2, 21.8]) {
      g.fillStyle(0x0b0d0f, 0.9).fillEllipse(11.5, py, 8.6, 6.4);
      g.fillStyle(lighten(armor, 14), 1).fillEllipse(11.5, py, 7.4, 5.2);
      g.fillStyle(lighten(armor, 34), 0.7).fillEllipse(10.6, py - 0.8, 3, 1.8);
    }
    if (look.stripes) {
      g.fillStyle(look.accent, 1).fillRect(10.2, 4.2, 1.1, 4).fillRect(12.2, 4.2, 1.1, 4).fillRect(10.2, 19.8, 1.1, 4).fillRect(12.2, 19.8, 1.1, 4);
    } else {
      g.fillStyle(look.accent, 1).fillRect(9.6, 5.6, 4, 1.1).fillRect(9.6, 21.2, 4, 1.1);
    }
  }

  // Helmet
  const helm = look.helmet ?? 0xc9d3dc;
  if (look.hood) {
    g.fillStyle(0x2c3820, 1).fillCircle(12.6, 14, 5.4);
    g.fillStyle(0x3d4a2c, 1).fillCircle(12.4, 14, 4.8);
    g.fillStyle(0x51603a, 1).fillCircle(11, 12.5, 1.9).fillCircle(12.5, 16.5, 1.7).fillCircle(9.8, 15.5, 1.5);
    g.fillStyle(0x0d1a12, 1).fillEllipse(16.2, 14, 2.6, 5);
    g.fillStyle(VISOR, 0.9).fillRect(16.6, 12.9, 0.9, 2.2);
  } else {
    g.fillStyle(0x0b0d0f, 0.9).fillCircle(12.6, 14, 5.2);
    g.fillStyle(helm, 1).fillCircle(12.4, 14, 4.5);
    g.fillStyle(lighten(helm, 26), 1).fillCircle(11.4, 12.8, 1.8); // specular
    g.lineStyle(1, 0x7d8a96, 1).lineBetween(8.4, 14, 13.5, 14); // crest ridge
    g.fillStyle(0x0b1418, 1).fillEllipse(15.6, 14, 3.2, 6.6); // visor frame
    g.fillStyle(VISOR, 1).fillEllipse(16, 14, 2, 5.4);
    g.fillStyle(0xffffff, 0.85).fillRect(15.8, 11.9, 0.7, 1.4);
    if (look.cross) g.fillStyle(0x3fbf6a, 1).fillRect(9.8, 13.4, 3.2, 1.2).fillRect(10.8, 12.4, 1.2, 3.2);
    if (look.lamp) g.fillStyle(0xfff2c4, 1).fillRect(14, 9.6, 1.5, 1.5);
    g.lineStyle(0.6, 0x111111, 1).lineBetween(9.6, 10.6, 7.6, 9);
  }
}

const SLATE = 0x5d6b78, SLATE_D = 0x3a4550;
const OLIVE = 0x5a6650, OLIVE_D = 0x3a4436;

/** Looks for every soldier art ID. */
export const SoldierLooks: Record<string, SoldierLook> = {
  'unit.rifle': { weapon: 'carbine', pack: 'pack', armor: SLATE, armorDark: SLATE_D, accent: 0x47e0ff },
  'unit.assault': { weapon: 'shotgun', pack: 'tank', armor: 0x6a5a4c, armorDark: 0x43382e, accent: 0xff8a3a, stripes: true },
  'unit.marksman': { weapon: 'dmr', pack: 'pack', armor: 0x55665e, armorDark: 0x36423c, accent: 0x7be08a },
  'unit.heavy': { weapon: 'launcher', pack: 'ammo', armor: OLIVE, armorDark: OLIVE_D, accent: 0xf2c14a },
  'unit.loader': { weapon: 'carbine', pack: 'ammo', armor: OLIVE, armorDark: OLIVE_D, accent: 0xf2c14a },
  'unit.rocket': { weapon: 'rocket', pack: 'ammo', armor: OLIVE, armorDark: OLIVE_D, accent: 0xff5a3a, stripes: true },
  'unit.gatling': { weapon: 'gatling', pack: 'belt', armor: 0x6b6450, armorDark: 0x46412f, accent: 0xf2c14a, stripes: true },
  'unit.sniper': { weapon: 'sniper', pack: 'none', armor: 0x4a5a36, armorDark: 0x34402a, accent: 0x47e0ff, hood: true },
  'unit.antimateriel': { weapon: 'amr', pack: 'none', armor: 0x4a5a36, armorDark: 0x34402a, accent: 0x47e0ff, hood: true },
  'unit.spotter': { weapon: 'binocs', pack: 'radio', armor: 0x55614a, armorDark: 0x384032, accent: 0x47e0ff },
  'unit.engineer': { weapon: 'tool', pack: 'tools', armor: 0x6e6a5e, armorDark: 0x46443c, accent: 0xf2a93b, stripes: true, lamp: true, helmet: 0xf2c14a },
  'unit.medic': { weapon: 'medkit', pack: 'medic', armor: 0xb9c2c9, armorDark: 0x7d8790, accent: 0x3fbf6a, cross: true, helmet: 0xe8eef2 },
};
