/**
 * loyalty.ts — Loyalty calculation and breakaway detection.
 *
 * Loyalty is a float in [-1, +1]. Multiply by 100 to get the display value [-100, +100].
 *
 * Pure TypeScript. No React, no Zustand.
 */

import type { TraitVector } from '../types';
import type { TuningConfig } from '../config';

export const SPAWN_LOYALTY = 0.3;

const TRAIT_KEYS: (keyof TraitVector)[] = [
  'ecology', 'militarism', 'religion', 'individualism', 'progress',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Standard cosine similarity over the five trait dimensions.
 * Returns a value in [-1, +1]. Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: TraitVector, b: TraitVector): number {
  let dot = 0, magA = 0, magB = 0;
  for (const key of TRAIT_KEYS) {
    dot  += a[key] * b[key];
    magA += a[key] * a[key];
    magB += b[key] * b[key];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function calculateLoyaltyTarget(
  ownerAlignment: TraitVector,
  tileCulture: TraitVector,
  enemyNeighborAlignments: TraitVector[],
  config: TuningConfig['loyalty']
): { target: number } {
  const mad = TRAIT_KEYS.reduce(
    (sum, k) => sum + Math.abs(ownerAlignment[k] - tileCulture[k]), 0
  ) / TRAIT_KEYS.length;
  const base = clamp(1 - mad * 2, -1, 1);

  let pressure = 0;
  if (enemyNeighborAlignments.length > 0) {
    const ownerSim = cosineSimilarity(ownerAlignment, tileCulture);
    let bestNeighborSim = -Infinity;
    for (const alignment of enemyNeighborAlignments) {
      const sim = cosineSimilarity(alignment, tileCulture);
      if (sim > bestNeighborSim) bestNeighborSim = sim;
    }
    pressure = Math.max(0, bestNeighborSim - ownerSim) * config.neighborPressureStrength;
  }

  return { target: clamp(base - pressure, -1, 1) };
}

/**
 * Advance loyalty one step toward its target.
 * Moves by `momentumRate` fraction of the remaining gap each turn.
 * Result is never outside the bounds already set by calculateLoyaltyTarget.
 */
export function stepLoyalty(current: number, target: number, momentumRate: number): number {
  return current + (target - current) * momentumRate;
}

/**
 * Returns true when a tile's loyalty has fallen to or below the breakaway threshold.
 */
export function isBreakawayCandidate(loyalty: number, threshold: number): boolean {
  return loyalty <= threshold;
}
