/**
 * Global tech tree: spend stars earned in missions on permanent upgrades. Nodes in a branch
 * unlock top to bottom (`requires`). Respec is free from the Tech screen.
 */
import type { TechNode } from './types';

export const TECH_BRANCHES = ['Infantry', 'Heavy', 'Support', 'Armor', 'Economy', 'Command', 'Heroes'];

export const Tech: TechNode[] = [
  // Infantry
  { id: 'inf1', branch: 'Infantry', name: 'Drill Sergeants', desc: 'Rifle Squads deal +12% damage.', cost: 1, mods: [{ kind: 'unitStat', unit: 'rifle', stat: 'damage', mult: 1.12 }] },
  { id: 'inf2', branch: 'Infantry', name: 'Quartermaster', desc: 'Rifle Squads cost 15% less.', cost: 2, requires: 'inf1', mods: [{ kind: 'unitCost', unit: 'rifle', mult: 0.85 }] },
  { id: 'inf3', branch: 'Infantry', name: 'Composite Plate', desc: 'Rifle Squad troopers +20% HP.', cost: 2, requires: 'inf2', mods: [{ kind: 'unitStat', unit: 'rifle', stat: 'hp', mult: 1.2 }] },
  { id: 'inf4', branch: 'Infantry', name: 'Long Barrels', desc: 'Rifle Squads +10% range.', cost: 3, requires: 'inf3', mods: [{ kind: 'unitStat', unit: 'rifle', stat: 'range', mult: 1.1 }] },
  // Heavy
  { id: 'hvy1', branch: 'Heavy', name: 'Bigger Charges', desc: 'Heavy Weapons blast radius +15%.', cost: 1, mods: [{ kind: 'unitStat', unit: 'heavy', stat: 'splash', mult: 1.15 }] },
  { id: 'hvy2', branch: 'Heavy', name: 'Autoloaders', desc: 'Heavy Weapons fire 12% faster.', cost: 2, requires: 'hvy1', mods: [{ kind: 'unitStat', unit: 'heavy', stat: 'rof', mult: 1.12 }] },
  { id: 'hvy3', branch: 'Heavy', name: 'HEAT Rounds', desc: 'Heavy Weapons +15% damage.', cost: 3, requires: 'hvy2', mods: [{ kind: 'unitStat', unit: 'heavy', stat: 'damage', mult: 1.15 }] },
  // Support
  { id: 'sup1', branch: 'Support', name: 'Ballistics Computer', desc: 'Sniper Teams +12% range.', cost: 1, mods: [{ kind: 'unitStat', unit: 'sniper', stat: 'range', mult: 1.12 }] },
  { id: 'sup2', branch: 'Support', name: 'Nano-Bandages', desc: 'Engineer healing auras heal +50%.', cost: 2, requires: 'sup1', mods: [{ kind: 'aura', heal: 1.5 }] },
  { id: 'sup3', branch: 'Support', name: 'Match Grade Ammo', desc: 'Sniper Teams +15% damage.', cost: 3, requires: 'sup2', mods: [{ kind: 'unitStat', unit: 'sniper', stat: 'damage', mult: 1.15 }] },
  // Armor
  { id: 'arm1', branch: 'Armor', name: 'Spaced Armor', desc: 'Vehicles +20% HP.', cost: 1, mods: [{ kind: 'unitStat', unit: 'motorpool', stat: 'hp', mult: 1.2 }] },
  { id: 'arm2', branch: 'Armor', name: 'Lean Logistics', desc: 'Vehicles cost 15% less.', cost: 2, requires: 'arm1', mods: [{ kind: 'unitCost', unit: 'motorpool', mult: 0.85 }] },
  { id: 'arm3', branch: 'Armor', name: 'Fire Control', desc: 'Vehicles +12% damage and range.', cost: 3, requires: 'arm2', mods: [{ kind: 'unitStat', unit: 'motorpool', stat: 'damage', mult: 1.12 }, { kind: 'unitStat', unit: 'motorpool', stat: 'range', mult: 1.12 }] },
  // Economy
  { id: 'eco1', branch: 'Economy', name: 'Forward Caches', desc: '+50 starting supplies.', cost: 1, mods: [{ kind: 'startSupplies', add: 50 }] },
  { id: 'eco2', branch: 'Economy', name: 'Salvage Crews', desc: 'Selling refunds 85% (was 70%).', cost: 1, requires: 'eco1', mods: [{ kind: 'sellRefund', value: 0.85 }] },
  { id: 'eco3', branch: 'Economy', name: 'Supply Contracts', desc: 'Supply Depots pay 20% more.', cost: 2, requires: 'eco2', mods: [{ kind: 'depotIncome', mult: 1.2 }] },
  { id: 'eco4', branch: 'Economy', name: 'Field Promotion', desc: '+1 Command Cap.', cost: 3, requires: 'eco3', mods: [{ kind: 'commandCap', add: 1 }] },
  // Command (powers)
  { id: 'cmd1', branch: 'Command', name: 'Priority Channel', desc: 'All power cooldowns −15%.', cost: 1, mods: [{ kind: 'powerCooldown', power: '*', mult: 0.85 }] },
  { id: 'cmd2', branch: 'Command', name: 'Heavy Payload', desc: 'Orbital Strike +30% damage and radius; Airstrike +2 bombs.', cost: 2, requires: 'cmd1', mods: [{ kind: 'powerStat', power: 'orbital', stat: 'damage', mult: 1.3 }, { kind: 'powerStat', power: 'orbital', stat: 'radius', mult: 1.3 }, { kind: 'powerStat', power: 'airstrike', stat: 'bombs', add: 2 }] },
  { id: 'cmd3', branch: 'Command', name: 'Veteran Pods', desc: 'Drop Pods land tier III squads for 45s; EMP stuns 50% longer.', cost: 2, requires: 'cmd2', mods: [{ kind: 'powerStat', power: 'droppod', stat: 'tier', add: 1 }, { kind: 'powerStat', power: 'droppod', stat: 'duration', add: 15 }, { kind: 'powerStat', power: 'emp', stat: 'stun', mult: 1.5 }] },
  // Heroes
  { id: 'her1', branch: 'Heroes', name: 'Battle Hardened', desc: 'Heroes gain 30% more XP.', cost: 1, mods: [{ kind: 'heroXp', mult: 1.3 }] },
  { id: 'her2', branch: 'Heroes', name: 'Medevac', desc: 'Heroes respawn 40% faster.', cost: 1, requires: 'her1', mods: [{ kind: 'heroRespawn', mult: 0.6 }] },
  { id: 'her3', branch: 'Heroes', name: 'Veteran Command', desc: 'Heroes start at level 3.', cost: 2, requires: 'her2', mods: [{ kind: 'heroStartLevel', add: 2 }] },
];
