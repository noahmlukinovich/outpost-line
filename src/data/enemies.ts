/**
 * The Choir: enemy roster. Each enemy asks a different question of your defense.
 * (Veilstalkers, Skyrays, Tenders, Brood Barges and bosses arrive in M3.)
 */
import type { EnemyDef } from './types';

export const Enemies = {
  skitter: {
    id: 'skitter',
    name: 'Skitter',
    hint: 'Fast swarms. Use splash damage.',
    hp: 18,
    shield: 0,
    shieldRegen: 0,
    shieldDelay: 0,
    armor: 0,
    speed: 66,
    bounty: 3,
    leak: 1,
    radius: 9,
    attack: { kind: 'melee', damage: 3, rate: 1.2, range: 34 },
    berserkAt: 0,
    art: 'enemy.skitter',
  },

  warden: {
    id: 'warden',
    name: 'Warden',
    hint: 'Regenerating shield. Focus fire to break it, and use cover.',
    hp: 60,
    shield: 60,
    shieldRegen: 14,
    shieldDelay: 2.5,
    armor: 0.1,
    speed: 36,
    bounty: 10,
    leak: 2,
    radius: 12,
    attack: { kind: 'ranged', damage: 7, rate: 0.8, range: 140 },
    berserkAt: 0,
    art: 'enemy.warden',
  },

  ironback: {
    id: 'ironback',
    name: 'Ironback',
    hint: 'Heavy armor; bullets barely scratch it. Use explosives. Berserks when hurt.',
    hp: 320,
    shield: 0,
    shieldRegen: 0,
    shieldDelay: 0,
    armor: 0.7,
    speed: 26,
    bounty: 30,
    leak: 4,
    radius: 17,
    attack: { kind: 'melee', damage: 16, rate: 0.6, range: 40 },
    berserkAt: 0.3,
    art: 'enemy.ironback',
  },
} satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof Enemies;

export function getEnemy(id: string): EnemyDef {
  const def = (Enemies as Record<string, EnemyDef>)[id];
  if (!def) throw new Error(`Unknown enemy id "${id}"`);
  return def;
}
