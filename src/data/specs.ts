/**
 * Specializations: after tier III, each squad picks ONE of its two specializations, then can
 * buy that specialization's abilities. Abilities are lists of effects (see Effect in types.ts).
 *
 * `tech` is the tech level required (Power from Reactors). `weapon` replaces the squad's weapon.
 */
import type { SpecDef } from './types';

export const Specs = {
  // ---------------------------------------------------------------- Rifle Squad
  assault: {
    id: 'assault',
    name: 'Assault Team',
    blurb: 'Close range shredders who hold the road.',
    cost: 120,
    tech: 2,
    art: 'unit.assault',
    trooperHp: 62,
    blockCap: 4,
    weapon: { damage: 12, rof: 3, range: 125, damageType: 'ballistic', accuracy: 0.92 },
    abilities: [
      { id: 'incinerator', name: 'Incinerator', cost: 130, tech: 2,
        desc: 'Flamethrower burst every 3s: burns everything in a cone.',
        effects: [{ kind: 'flame', interval: 3, range: 90, arcDeg: 70, damage: 14, burnDps: 7, burnTime: 3 }] },
      { id: 'breach', name: 'Breach Charges', cost: 85, tech: 2,
        desc: 'Grenade every 8s: splash damage + 1.2s stun.',
        effects: [{ kind: 'grenade', interval: 8, damage: 34, radius: 44, stun: 1.2 }] },
      { id: 'holdline', name: 'Hold the Line', cost: 110, tech: 3,
        desc: 'Blocks 2 more enemies and takes 25% less damage.',
        effects: [{ kind: 'stat', stat: 'blockCap', add: 2 }, { kind: 'armor', reduction: 0.25 }] },
    ],
  },

  marksman: {
    id: 'marksman',
    name: 'Marksman Team',
    blurb: 'Long-range armor-piercing rifles.',
    cost: 130,
    tech: 2,
    art: 'unit.marksman',
    arcDeg: 110,
    weapon: { damage: 32, rof: 0.95, range: 240, damageType: 'ap', accuracy: 0.95 },
    abilities: [
      { id: 'tungsten', name: 'Tungsten Rounds', cost: 100, tech: 2,
        desc: '+25% damage, ignores even more armor.',
        effects: [{ kind: 'stat', stat: 'damage', mult: 1.25 }, { kind: 'stat', stat: 'pierce', add: 0.15 }] },
      { id: 'overwatch', name: 'Overwatch', cost: 85, tech: 2,
        desc: 'First shot at each new target deals 2.5× damage.',
        effects: [{ kind: 'firstShot', mult: 2.5 }] },
      { id: 'steadyaim', name: 'Steady Aim', cost: 120, tech: 3,
        desc: 'In cover: +20% range and +25% fire rate.',
        effects: [{ kind: 'coverBonus', range: 1.2, rof: 1.25 }] },
    ],
  },

  // ---------------------------------------------------------------- Heavy Weapons
  rocket: {
    id: 'rocket',
    name: 'Rocket Team',
    blurb: 'Anti-armor rockets. Can hit fliers.',
    cost: 140,
    tech: 2,
    leadArt: 'unit.rocket',
    weapon: { damage: 110, rof: 0.55, range: 230, damageType: 'ap', accuracy: 1, splashRadius: 32, projectileSpeed: 520, projectile: 'rocket' },
    effects: [{ kind: 'antiAir' }],
    abilities: [
      { id: 'tandem', name: 'Tandem Warheads', cost: 110, tech: 2,
        desc: '+50% damage against armored enemies.',
        effects: [{ kind: 'armoredMult', mult: 1.5 }] },
      { id: 'cluster', name: 'Cluster Payload', cost: 100, tech: 2,
        desc: 'Blast radius +70%.',
        effects: [{ kind: 'stat', stat: 'splash', mult: 1.7 }] },
      { id: 'salvo', name: 'Lock-On Salvo', cost: 135, tech: 3,
        desc: 'Fires at up to 3 targets per volley (65% damage each).',
        effects: [{ kind: 'multishot', count: 3, dmgMult: 0.65 }] },
    ],
  },

  gatling: {
    id: 'gatling',
    name: 'Gatling Team',
    blurb: 'Wall of lead. Slows swarms.',
    cost: 130,
    tech: 2,
    leadArt: 'unit.gatling',
    arcDeg: 110,
    weapon: { damage: 6, rof: 14, range: 180, damageType: 'ballistic', accuracy: 0.8 },
    effects: [{ kind: 'onHit', status: 'slow', strength: 0.25, duration: 0.8 }],
    abilities: [
      { id: 'spinup', name: 'Spin-Up', cost: 95, tech: 2,
        desc: 'Fire rate ramps up to double after 3s of firing.',
        effects: [{ kind: 'spinUp', maxBonus: 1, seconds: 3 }] },
      { id: 'shredder', name: 'Shredder Belts', cost: 85, tech: 2,
        desc: 'Stronger slow (45%) and +50% damage to shields.',
        effects: [{ kind: 'onHit', status: 'slow', strength: 0.45, duration: 1 }, { kind: 'shieldMult', mult: 1.5 }] },
      { id: 'suppress', name: 'Suppressive Fire', cost: 120, tech: 3,
        desc: 'Enemies hit attack 50% slower for 2s.',
        effects: [{ kind: 'onHit', status: 'suppress', strength: 0.5, duration: 2 }] },
    ],
  },

  // ---------------------------------------------------------------- Sniper Team
  spotter: {
    id: 'spotter',
    name: 'Spotter Team',
    blurb: 'Marks targets so everyone hits harder.',
    cost: 110,
    tech: 2,
    weapon: { damage: 95, rof: 0.55, range: 320, damageType: 'ap', accuracy: 0.99 },
    effects: [{ kind: 'onHit', status: 'mark', strength: 0.15, duration: 5 }],
    abilities: [
      { id: 'marktarget', name: 'Mark Target', cost: 85, tech: 2,
        desc: 'Marked enemies take +30% damage from everyone (was +15%).',
        effects: [{ kind: 'onHit', status: 'mark', strength: 0.3, duration: 6 }] },
      { id: 'thermal', name: 'Thermal Optics', cost: 75, tech: 2,
        desc: 'Reveals cloaked enemies nearby (they arrive in M3). +10% range.',
        effects: [{ kind: 'detect', radius: 200 }, { kind: 'stat', stat: 'range', mult: 1.1 }] },
      { id: 'correction', name: 'Call Correction', cost: 110, tech: 3,
        desc: 'Marked enemies pay +60% supplies when killed by anyone.',
        effects: [{ kind: 'markBounty', bonus: 0.6 }] },
    ],
  },

  antimateriel: {
    id: 'antimateriel',
    name: 'Anti-Materiel',
    blurb: 'Huge rounds that punch through lines.',
    cost: 150,
    tech: 2,
    leadArt: 'unit.antimateriel',
    weapon: { damage: 170, rof: 0.34, range: 310, damageType: 'ap', accuracy: 0.99 },
    effects: [{ kind: 'pierceTargets', count: 1, dmgMult: 0.7 }],
    abilities: [
      { id: 'shieldbreaker', name: 'Shield Breaker', cost: 95, tech: 2,
        desc: 'Triple damage against shields.',
        effects: [{ kind: 'shieldMult', mult: 3 }] },
      { id: 'overpen', name: 'Overpenetration', cost: 110, tech: 2,
        desc: 'Each shot passes through 2 more enemies.',
        effects: [{ kind: 'pierceTargets', count: 2, dmgMult: 0.7 }] },
      { id: 'heavycal', name: 'Heavy Caliber', cost: 130, tech: 3,
        desc: 'Every hit stuns for 1.2s.',
        effects: [{ kind: 'onHit', status: 'stun', strength: 1, duration: 1.2 }] },
    ],
  },

  // ---------------------------------------------------------------- Engineers
  medic: {
    id: 'medic',
    name: 'Medic Post',
    blurb: 'Strong healing aura for nearby squads.',
    cost: 120,
    tech: 2,
    art: 'unit.medic',
    weapon: { damage: 5, rof: 1.8, range: 130, damageType: 'ballistic', accuracy: 0.85 },
    effects: [{ kind: 'aura', radius: 140, heal: 7 }],
    abilities: [
      { id: 'surgery', name: 'Field Surgery', cost: 85, tech: 2,
        desc: 'Squads nearby get lost troopers back twice as fast.',
        effects: [{ kind: 'aura', radius: 140, reinforce: 2 }] },
      { id: 'stims', name: 'Stim Packs', cost: 110, tech: 2,
        desc: 'Squads nearby fire 20% faster.',
        effects: [{ kind: 'aura', radius: 140, rof: 1.2 }] },
      { id: 'combatmedic', name: 'Combat Medic', cost: 130, tech: 3,
        desc: 'Instantly revives a Down squad nearby (every 30s).',
        effects: [{ kind: 'revive', radius: 160, cooldown: 30 }] },
    ],
  },

  turrets: {
    id: 'turrets',
    name: 'Turret Crew',
    blurb: 'Deploys two auto-turrets.',
    cost: 130,
    tech: 2,
    art: 'unit.engineer',
    weapon: { damage: 5, rof: 1.8, range: 130, damageType: 'ballistic', accuracy: 0.85 },
    effects: [{ kind: 'turrets', count: 2, weapon: { damage: 8, rof: 3, range: 160, damageType: 'ballistic', accuracy: 0.9 } }],
    abilities: [
      { id: 'thirdturret', name: 'Third Turret', cost: 100, tech: 2,
        desc: 'Deploys one more turret.',
        effects: [{ kind: 'turrets', count: 1 }] },
      { id: 'heavybarrels', name: 'Heavy Barrels', cost: 95, tech: 2,
        desc: 'Turrets deal +60% damage.',
        effects: [{ kind: 'turretStat', damage: 1.6 }] },
      { id: 'flak', name: 'Flak Kit', cost: 120, tech: 3,
        desc: 'Turrets get +25% range and can hit fliers (M3).',
        effects: [{ kind: 'turretStat', range: 1.25 }, { kind: 'antiAir' }] },
    ],
  },

  // ---------------------------------------------------------------- Motor Pool
  siege: {
    id: 'siege',
    name: 'Siege Tank',
    blurb: 'Long-range artillery. Huge blasts; can\'t hit fliers.',
    cost: 200,
    tech: 3,
    art: 'veh.tank.turret',
    vehicleHull: 'veh.tank.hull',
    trooperHp: 520,
    arcDeg: 160,
    weapon: { damage: 130, rof: 0.32, range: 300, damageType: 'explosive', accuracy: 1, splashRadius: 70, projectileSpeed: 420 },
    abilities: [
      { id: 'bunkerbuster', name: 'Bunker Buster', cost: 140, tech: 3,
        desc: '+60% damage against armored enemies.',
        effects: [{ kind: 'armoredMult', mult: 1.6 }] },
      { id: 'siegemode', name: 'Siege Mode', cost: 160, tech: 3,
        desc: '+30% range and +25% blast radius.',
        effects: [{ kind: 'stat', stat: 'range', mult: 1.3 }, { kind: 'stat', stat: 'splash', mult: 1.25 }] },
      { id: 'reactive', name: 'Reactive Armor', cost: 120, tech: 3,
        desc: 'Takes 40% less damage.',
        effects: [{ kind: 'armor', reduction: 0.4 }] },
    ],
  },

  aawalker: {
    id: 'aawalker',
    name: 'Anti-Air Walker',
    blurb: 'Flak walker. Shreds fliers and dropships.',
    cost: 180,
    tech: 3,
    art: 'veh.walker.turret',
    vehicleHull: 'veh.walker.hull',
    trooperHp: 440,
    arcDeg: 240,
    weapon: { damage: 9, rof: 7, range: 240, damageType: 'ballistic', accuracy: 0.9 },
    effects: [{ kind: 'antiAir' }],
    abilities: [
      { id: 'flakburst', name: 'Flak Burst', cost: 120, tech: 3,
        desc: '+35% damage.',
        effects: [{ kind: 'stat', stat: 'damage', mult: 1.35 }] },
      { id: 'interceptors', name: 'Interceptor Pods', cost: 150, tech: 3,
        desc: 'Fires at up to 3 targets at once (70% damage each).',
        effects: [{ kind: 'multishot', count: 3, dmgMult: 0.7 }] },
      { id: 'uplink', name: 'Target Uplink', cost: 130, tech: 3,
        desc: 'Squads nearby fire 15% faster.',
        effects: [{ kind: 'aura', radius: 150, rof: 1.15 }] },
    ],
  },
} satisfies Record<string, SpecDef>;

export function getSpec(id: string): SpecDef {
  const def = (Specs as Record<string, SpecDef>)[id];
  if (!def) throw new Error(`Unknown specialization "${id}"`);
  return def;
}
