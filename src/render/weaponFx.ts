/**
 * Per-weapon visual style: muzzle flash, smoke, casings and tracer look. Tweak freely; this is
 * pure presentation (balance lives in src/data).
 */
import type { WeaponKind } from '../assets/soldiers';

export interface WeaponFx {
  /** Flash texture variants (picked at random each shot). */
  flash: string[];
  /** Flash length in world units. */
  flashLen: number;
  flashTint: number;
  /** Glow light size and color. */
  glow: number;
  glowColor: number;
  /** Muzzle smoke wisps per shot. */
  smoke: number;
  casing: 'small' | 'big' | 'shell' | null;
  /** Eject a casing on 1 in N shots (gatling only drops some). */
  casingEvery: number;
  tracerColor: number;
  tracerLen: number;
  tracerWidth: number;
  tracerSpeed: number;
  /** Screen shake per shot (0 = none). */
  shake: number;
}

const CONE = ['fx.mf.cone0', 'fx.mf.cone1', 'fx.mf.cone2'];

export const WEAPON_FX: Record<WeaponKind, WeaponFx> = {
  carbine: { flash: CONE, flashLen: 22, flashTint: 0xffe2a0, glow: 70, glowColor: 0xffc870, smoke: 1, casing: 'small', casingEvery: 1, tracerColor: 0xffe08a, tracerLen: 36, tracerWidth: 1.5, tracerSpeed: 1800, shake: 0 },
  smg: { flash: CONE, flashLen: 16, flashTint: 0xffe2a0, glow: 50, glowColor: 0xffc870, smoke: 0, casing: 'small', casingEvery: 1, tracerColor: 0xffe08a, tracerLen: 26, tracerWidth: 1.2, tracerSpeed: 1600, shake: 0 },
  tool: { flash: CONE, flashLen: 15, flashTint: 0xffe2a0, glow: 45, glowColor: 0xffc870, smoke: 0, casing: 'small', casingEvery: 1, tracerColor: 0xffe08a, tracerLen: 24, tracerWidth: 1.2, tracerSpeed: 1600, shake: 0 },
  medkit: { flash: CONE, flashLen: 15, flashTint: 0xffe2a0, glow: 45, glowColor: 0xffc870, smoke: 0, casing: 'small', casingEvery: 1, tracerColor: 0xffe08a, tracerLen: 24, tracerWidth: 1.2, tracerSpeed: 1600, shake: 0 },
  shotgun: { flash: ['fx.mf.wide'], flashLen: 26, flashTint: 0xffd890, glow: 90, glowColor: 0xffb060, smoke: 2, casing: 'big', casingEvery: 2, tracerColor: 0xffd070, tracerLen: 22, tracerWidth: 1.4, tracerSpeed: 1500, shake: 0 },
  dmr: { flash: CONE, flashLen: 30, flashTint: 0xd8f0ff, glow: 90, glowColor: 0xbfe8ff, smoke: 2, casing: 'small', casingEvery: 1, tracerColor: 0xbfe8ff, tracerLen: 60, tracerWidth: 1.8, tracerSpeed: 2400, shake: 0 },
  gatling: { flash: CONE, flashLen: 24, flashTint: 0xffc070, glow: 80, glowColor: 0xffa040, smoke: 0, casing: 'small', casingEvery: 2, tracerColor: 0xffa850, tracerLen: 30, tracerWidth: 1.4, tracerSpeed: 1900, shake: 0 },
  sniper: { flash: ['fx.mf.brake'], flashLen: 46, flashTint: 0xe8f6ff, glow: 150, glowColor: 0xd0f0ff, smoke: 4, casing: 'big', casingEvery: 1, tracerColor: 0xd8f4ff, tracerLen: 110, tracerWidth: 2.4, tracerSpeed: 3200, shake: 0.0015 },
  amr: { flash: ['fx.mf.brake'], flashLen: 60, flashTint: 0xfff0d0, glow: 190, glowColor: 0xffe0b0, smoke: 6, casing: 'big', casingEvery: 1, tracerColor: 0xfff0c8, tracerLen: 140, tracerWidth: 3.2, tracerSpeed: 3400, shake: 0.0025 },
  launcher: { flash: ['fx.mf.thump'], flashLen: 26, flashTint: 0xffd0a0, glow: 110, glowColor: 0xffa050, smoke: 5, casing: 'shell', casingEvery: 1, tracerColor: 0xffffff, tracerLen: 0, tracerWidth: 0, tracerSpeed: 0, shake: 0.001 },
  rocket: { flash: ['fx.mf.thump'], flashLen: 30, flashTint: 0xffd0a0, glow: 130, glowColor: 0xffa050, smoke: 6, casing: null, casingEvery: 1, tracerColor: 0xffffff, tracerLen: 0, tracerWidth: 0, tracerSpeed: 0, shake: 0.0015 },
  binocs: { flash: CONE, flashLen: 14, flashTint: 0xffe2a0, glow: 40, glowColor: 0xffc870, smoke: 0, casing: 'small', casingEvery: 1, tracerColor: 0xffe08a, tracerLen: 24, tracerWidth: 1.2, tracerSpeed: 1600, shake: 0 },
};

/** Auto-turrets. */
export const TURRET_FX: WeaponFx = { ...WEAPON_FX.carbine, flashLen: 18, glow: 55, smoke: 0, casingEvery: 2 };
