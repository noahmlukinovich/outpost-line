/**
 * Commander powers: one-tap support with cooldowns. Tune freely.
 * (Upgrades for these arrive with the global tech tree in M4.)
 */
import type { PowerDef, PowerId } from './types';

export const Powers: Record<PowerId, PowerDef> = {
  orbital: {
    id: 'orbital',
    name: 'Orbital Strike',
    desc: 'Tap a spot: after a short lock-on, a massive beam obliterates the area.',
    cooldown: 70,
    initialCooldown: 25,
    delay: 1.8,
    radius: 85,
    damage: 650,
  },
  airstrike: {
    id: 'airstrike',
    name: 'Airstrike',
    desc: 'Drag a line: a bombing run carpets it. A tap follows the road.',
    cooldown: 55,
    initialCooldown: 15,
    delay: 1.2,
    radius: 46,
    damage: 140,
    length: 340,
    bombs: 8,
  },
  emp: {
    id: 'emp',
    name: 'EMP',
    desc: 'Tap a spot: stuns enemies (big ones longer), strips shields, reveals cloaked enemies.',
    cooldown: 50,
    initialCooldown: 10,
    delay: 0.4,
    radius: 150,
    damage: 0,
    stun: 1.5,
    stunLarge: 4,
    reveal: 8,
  },
  droppod: {
    id: 'droppod',
    name: 'Drop Pods',
    desc: 'Tap a spot: a Rifle Squad (tier II) lands for 30s. Ignores Command Cap; can land on the road.',
    cooldown: 60,
    initialCooldown: 5,
    delay: 1.4,
    radius: 30,
    damage: 60,
    unit: 'rifle',
    tier: 1,
    duration: 30,
  },
};

export const POWER_ORDER: PowerId[] = ['orbital', 'airstrike', 'emp', 'droppod'];
