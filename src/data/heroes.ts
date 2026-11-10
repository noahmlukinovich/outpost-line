/**
 * Heroes: one per mission, chosen in the briefing. They level up (1–10) during the mission
 * from kills near them, and each has two abilities that scale with level.
 */
import type { HeroDef } from './types';

/** Total XP needed for levels 2..10. */
export const HERO_LEVEL_XP = [30, 80, 150, 240, 350, 480, 640, 830, 1050];
/** Seconds to respawn at the gate after falling. */
export const HERO_RESPAWN = 22;

export const Heroes: Record<string, HeroDef> = {
  kastellan: {
    id: 'kastellan',
    name: 'Cmdr. Rhea Kastellan',
    title: 'Field Commander',
    bio: 'Holds a line by holding her people together. Buffs squads and exposes the enemy.',
    art: 'hero.kastellan',
    hp: 160,
    armor: 0.2,
    speed: 105,
    blockCap: 2,
    weapon: { damage: 14, rof: 2.2, range: 175, damageType: 'ballistic', accuracy: 0.92 },
    damagePerLevel: 0.1,
    hpPerLevel: 0.12,
    abilities: [
      { id: 'rally', name: 'Rally Cry', kind: 'rally', level: 1, cooldown: 30, radius: 200, duration: 8, power: 0.3, powerPerLevel: 0.03,
        desc: 'Squads near her fire faster for 8s (+30%, more with level).' },
      { id: 'scan', name: 'Tactical Scan', kind: 'scan', level: 3, cooldown: 28, radius: 230, duration: 8, power: 0.25, powerPerLevel: 0.02,
        desc: 'Marks and reveals all enemies nearby: they take +25% damage for 8s.' },
    ],
  },
  okonjo: {
    id: 'okonjo',
    name: 'Sgt. "Bulwark" Okonjo',
    title: 'Breacher',
    bio: 'A walking wall with a riot shield. Stops the road cold and knocks the Choir flat.',
    art: 'hero.okonjo',
    hp: 320,
    armor: 0.4,
    speed: 85,
    blockCap: 5,
    weapon: { damage: 16, rof: 1.4, range: 110, damageType: 'ballistic', accuracy: 0.9 },
    damagePerLevel: 0.09,
    hpPerLevel: 0.14,
    unlockedBy: 'outpost01',
    abilities: [
      { id: 'shieldwall', name: 'Shield Wall', kind: 'shieldwall', level: 1, cooldown: 28, radius: 0, duration: 6, power: 0.75, powerPerLevel: 0.015,
        desc: 'For 6s: takes 75% less damage and blocks 5 more enemies.' },
      { id: 'slam', name: 'Ground Slam', kind: 'slam', level: 3, cooldown: 18, radius: 95, duration: 1.6, power: 70, powerPerLevel: 18,
        desc: 'Smashes the ground: damages and stuns enemies around him.' },
    ],
  },
  venn: {
    id: 'venn',
    name: 'Lt. Mara Venn',
    title: 'Pathfinder',
    bio: 'Recon sniper. Strikes from nowhere and leaves surprises on the road.',
    art: 'hero.venn',
    hp: 130,
    armor: 0.1,
    speed: 120,
    blockCap: 0,
    weapon: { damage: 60, rof: 0.7, range: 300, damageType: 'ap', accuracy: 0.98 },
    damagePerLevel: 0.11,
    hpPerLevel: 0.1,
    unlockedBy: 'outpost02',
    abilities: [
      { id: 'cloak', name: 'Cloak', kind: 'cloak', level: 1, cooldown: 26, radius: 0, duration: 6, power: 0.6, powerPerLevel: 0.04,
        desc: 'Vanishes for 6s: enemies ignore her and she deals +60% damage.' },
      { id: 'mines', name: 'Proximity Mines', kind: 'mines', level: 3, cooldown: 22, radius: 50, duration: 60, power: 90, powerPerLevel: 22,
        desc: 'Drops 3 mines on the nearest road; they blow up under ground enemies.' },
    ],
  },
};

export const HERO_ORDER = ['kastellan', 'okonjo', 'venn'];

export function getHero(id: string): HeroDef {
  const h = Heroes[id];
  if (!h) throw new Error(`Unknown hero "${id}"`);
  return h;
}

export function heroLevelFor(xp: number): number {
  let lvl = 1;
  for (const t of HERO_LEVEL_XP) if (xp >= t) lvl++;
  return lvl;
}
