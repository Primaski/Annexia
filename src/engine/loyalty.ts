/**
 * loyalty.ts — Loyalty calculation and breakaway detection.
 *
 * Loyalty is stored in internal units [-10000, +10000].
 * Divide by LOYALTY_SCALE (config.ts) to get the display value [-100, +100].
 *
 * Pure TypeScript. No React, no Zustand.
 */

import type { TraitVector } from '../types';
import type { TuningConfig } from '../config';

export const SPAWN_LOYALTY = 3000; // Internal units. = +30 display.

const TRAIT_KEYS: (keyof TraitVector)[] = [
  'ecology', 'militarism', 'religion', 'liberty', 'progress',
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

/**
 * Compute the loyalty target for an owned tile in internal units.
 *
 * 1. Base: cosineSimilarity(ownerAlignment, tileCulture) × 10000, rounded.
 * 2. Neighbor pressure: max(0, bestEnemySim − ownerSim) × strength × 10000, rounded.
 *    bestEnemySim is the highest similarity any enemy neighbor's alignment has
 *    with the tile's culture. Pressure = 0 if there are no enemy neighbors.
 * 3. Return clamp(base − pressure, −10000, +10000).
 */
export function calculateLoyaltyTarget(
  ownerAlignment: TraitVector,
  tileCulture: TraitVector,
  enemyNeighborAlignments: TraitVector[],
  config: TuningConfig['loyalty']
): number {
  // TODO: neighbor pressure uses cosine ownerSim — should be MAD-based for consistency
  const ownerSim = cosineSimilarity(ownerAlignment, tileCulture);
  const traitKeys: (keyof TraitVector)[] = [
    'ecology', 'militarism', 'religion', 'liberty', 'progress',
  ];
  const mad = traitKeys.reduce((sum, k) => sum + Math.abs(ownerAlignment[k] - tileCulture[k]), 0) / traitKeys.length;
  const base = Math.round((1 - mad * 2) * 10000);

  let pressure = 0;
  if (enemyNeighborAlignments.length > 0) {
    let bestNeighborSim = -Infinity;
    for (const alignment of enemyNeighborAlignments) {
      const sim = cosineSimilarity(alignment, tileCulture);
      if (sim > bestNeighborSim) bestNeighborSim = sim;
    }
    pressure = Math.round(
      Math.max(0, bestNeighborSim - ownerSim) * config.neighborPressureStrength * 10000
    );
  }

  return clamp(base - pressure, -10000, 10000);
}

/**
 * Advance loyalty one step toward its target.
 * Moves by `momentumRate` fraction of the remaining gap each turn.
 * Result is never outside the bounds already set by calculateLoyaltyTarget.
 */
export function stepLoyalty(current: number, target: number, momentumRate: number): number {
  return Math.round(current + (target - current) * momentumRate);
}

/**
 * Returns true when a tile's loyalty has fallen to or below the breakaway threshold.
 */
export function isBreakawayCandidate(loyalty: number, threshold: number): boolean {
  return loyalty <= threshold;
}
