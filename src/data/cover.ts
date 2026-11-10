/** Cover types. Maps place cover points with `coverType` set to one of these ids. */
import type { CoverDef } from './types';

export const Cover = {
  sandbags: { id: 'sandbags', name: 'Sandbags', damageReduction: 0.25, rangeBonus: 1.0, radius: 26, art: 'cover.sandbags' },
  trench: { id: 'trench', name: 'Trench', damageReduction: 0.35, rangeBonus: 1.0, radius: 28, art: 'cover.trench' },
  ruins: { id: 'ruins', name: 'Ruins', damageReduction: 0.3, rangeBonus: 1.1, radius: 28, art: 'cover.ruins' },
  bunker: { id: 'bunker', name: 'Bunker', damageReduction: 0.5, rangeBonus: 1.15, radius: 26, art: 'cover.bunker' },
} satisfies Record<string, CoverDef>;

export function getCover(id: string): CoverDef {
  const def = (Cover as Record<string, CoverDef>)[id];
  if (!def) throw new Error(`Unknown cover type "${id}"`);
  return def;
}
