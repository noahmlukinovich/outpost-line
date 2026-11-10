/**
 * Endless survival: waves are generated forever from a growing "threat budget".
 * Tweak these to make endless runs easier or harder.
 */
export const Endless = {
  /** Threat budget for wave n (1-based): base + perWave·n + quad·n². */
  budget: { base: 12, perWave: 8, quad: 0.75 },
  /** How much budget each enemy costs. */
  cost: { skitter: 1, warden: 5, ironback: 15, tender: 7, veilstalker: 8, skyray: 4, broodbarge: 26 } as Record<string, number>,
  /** Every Nth wave is a surge with this budget multiplier. */
  surgeEvery: 5,
  surgeMult: 1.5,
  /** From this wave on, enemies get tougher. */
  scaleFrom: 8,
  /** Per wave past scaleFrom: extra HP/shield fraction, extra speed fraction (capped). */
  hpPerWave: 0.075,
  speedPerWave: 0.012,
  maxSpeedBonus: 0.3,
  /** Most enemies in one wave (keeps the iPad smooth); extra budget becomes extra toughness. */
  maxEnemiesPerWave: 200,
  /** Supplies for clearing wave n: base + perWave·n. */
  clearBonus: { base: 18, perWave: 4 },
  /** Seconds between waves (a bit quicker than campaign missions). */
  countdown: 18,
  /** Themes the director picks from, with what share of the budget goes to each enemy. */
  themes: [
    { name: 'Swarm', mix: { skitter: 0.85, warden: 0.15 } },
    { name: 'Shield line', mix: { warden: 0.5, skitter: 0.35, tender: 0.15 } },
    { name: 'Armored push', mix: { ironback: 0.55, warden: 0.2, skitter: 0.1, tender: 0.15 } },
    { name: 'Combined assault', mix: { skitter: 0.35, warden: 0.25, ironback: 0.2, skyray: 0.1, veilstalker: 0.1 } },
    { name: 'Air raid', mix: { skyray: 0.6, broodbarge: 0.3, skitter: 0.1 } },
    { name: 'Ambush', mix: { veilstalker: 0.5, skitter: 0.3, tender: 0.2 } },
  ] as { name: string; mix: Record<string, number> }[],
  /** Enemies that may appear from a given wave on (so early waves stay simple). */
  unlockWave: { skitter: 1, warden: 4, ironback: 6, tender: 8, skyray: 12, veilstalker: 14, broodbarge: 16 } as Record<string, number>,
  /** A Colossus Strider joins every Nth wave (one more each time). */
  bossEvery: 20,
};
