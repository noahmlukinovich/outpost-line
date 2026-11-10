/**
 * Endless survival: waves are generated forever from a growing "threat budget".
 * Tweak these to make endless runs easier or harder.
 */
export const Endless = {
  /** Threat budget for wave n (1-based): base + perWave·n + quad·n². */
  budget: { base: 12, perWave: 8, quad: 0.75 },
  /** How much budget each enemy costs. */
  cost: { skitter: 1, warden: 5, ironback: 15 } as Record<string, number>,
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
    { name: 'Shield line', mix: { warden: 0.6, skitter: 0.4 } },
    { name: 'Armored push', mix: { ironback: 0.6, warden: 0.25, skitter: 0.15 } },
    { name: 'Combined assault', mix: { skitter: 0.4, warden: 0.3, ironback: 0.3 } },
  ] as { name: string; mix: Record<string, number> }[],
  /** Enemies that may appear from a given wave on (so early waves stay simple). */
  unlockWave: { skitter: 1, warden: 4, ironback: 6 } as Record<string, number>,
};
