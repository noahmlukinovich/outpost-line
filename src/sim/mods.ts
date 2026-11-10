/**
 * Global modifiers from the tech tree, flattened into one object the World reads.
 */
import { Balance } from '../data/balance';
import { Powers } from '../data/powers';
import { Tech } from '../data/tech';
import type { PowerDef, PowerId } from '../data/types';

export interface UnitMods {
  damage: number;
  rof: number;
  range: number;
  hp: number;
  splash: number;
  cost: number;
}

export interface GlobalMods {
  units: Record<string, UnitMods>;
  auraHeal: number;
  startSupplies: number;
  commandCap: number;
  sellRefund: number;
  depotIncome: number;
  powers: Record<PowerId, PowerDef>;
  heroXp: number;
  heroRespawn: number;
  heroStartLevel: number;
}

const unitMods = (): UnitMods => ({ damage: 1, rof: 1, range: 1, hp: 1, splash: 1, cost: 1 });

export function noMods(): GlobalMods {
  return computeMods([]);
}

export function computeMods(owned: string[]): GlobalMods {
  const m: GlobalMods = {
    units: {},
    auraHeal: 1,
    startSupplies: 0,
    commandCap: 0,
    sellRefund: Balance.sellRefund,
    depotIncome: 1,
    powers: JSON.parse(JSON.stringify(Powers)),
    heroXp: 1,
    heroRespawn: 1,
    heroStartLevel: 0,
  };
  const u = (id: string) => (m.units[id] ??= unitMods());
  for (const node of Tech) {
    if (!owned.includes(node.id)) continue;
    for (const mod of node.mods) {
      switch (mod.kind) {
        case 'unitStat': u(mod.unit)[mod.stat] *= mod.mult; break;
        case 'unitCost': u(mod.unit).cost *= mod.mult; break;
        case 'aura': m.auraHeal *= mod.heal; break;
        case 'startSupplies': m.startSupplies += mod.add; break;
        case 'commandCap': m.commandCap += mod.add; break;
        case 'sellRefund': m.sellRefund = Math.max(m.sellRefund, mod.value); break;
        case 'depotIncome': m.depotIncome *= mod.mult; break;
        case 'powerCooldown':
          for (const p of Object.values(m.powers)) if (mod.power === '*' || mod.power === p.id) p.cooldown *= mod.mult;
          break;
        case 'powerStat': {
          const p = m.powers[mod.power as PowerId];
          if (!p) break;
          const key = mod.stat === 'stun' ? 'stunLarge' : mod.stat;
          const apply = (k: keyof PowerDef) => {
            const cur = (p[k] as number | undefined) ?? 0;
            (p as unknown as Record<string, number>)[k] = (cur + (mod.add ?? 0)) * (mod.mult ?? 1);
          };
          apply(key as keyof PowerDef);
          if (mod.stat === 'stun') apply('stun');
          break;
        }
        case 'heroXp': m.heroXp *= mod.mult; break;
        case 'heroRespawn': m.heroRespawn *= mod.mult; break;
        case 'heroStartLevel': m.heroStartLevel += mod.add; break;
      }
    }
  }
  return m;
}

/** Modifiers for one unit id (its own entry combined with the '*' entry). */
export function modsFor(m: GlobalMods, unitId: string): UnitMods {
  const a = m.units[unitId] ?? unitMods(), b = m.units['*'] ?? unitMods();
  return { damage: a.damage * b.damage, rof: a.rof * b.rof, range: a.range * b.range, hp: a.hp * b.hp, splash: a.splash * b.splash, cost: a.cost * b.cost };
}
