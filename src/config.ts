/**
 * config.ts — Engine tuning constants for Annexia.
 * Holds developer-facing parameters. Distinct from player-facing GameConfig.
 * Apply presets by merging a Partial<TuningConfig> over DEFAULT_CONFIG.
 * 
 * FORMULAS & MECHANICS:
 * - Voronoi Resolution: voronoiPointCount = floor((cols * rows) / voronoiGrain)
 * - Noise Scales: Lower values mean smoother/larger shapes; higher values mean jagged/fractured shapes.
 * - Loyalty Drift: Moves by (gap * momentumRate) per turn. 1.0 snaps instantly; 0.2 moves 20% of gap.
 */

// Internal loyalty range is [-10000, +10000]. Divide by LOYALTY_SCALE to get display value [-100, +100].
export const LOYALTY_SCALE = 100;

export interface TuningConfig {
  map: {
    landRatio: number;          // Target fraction of land tiles (approximated via Voronoi/noise).
    barbarianFraction: number;  // Fraction of land tiles assigned to barbarian clusters at start.
    voronoiGrain: number;       // Cell density. Lower = more cells (finer coastlines); Higher = fewer cells (blockier).
    noiseScale: number;         // Simplex noise zoom for island shapes. Lower = wavy; Higher = fractured.
    cultureNoiseScale: number;  // Regional frequency. Lower = large homogeneous zones; Higher = fine variation.
  };
  loyalty: {
    neighborPressureStrength: number; // Multiplier for neighbor tile pull during calculation.
    breakawayThreshold: number;       // Internal units. Tile is a breakaway candidate when loyalty ≤ this value.
    momentumRate: number;             // Drift speed toward target. Percentage of gap closed per turn.
  };
}

export const DEFAULT_CONFIG: TuningConfig = {
  map: {
    landRatio: 0.3,
    barbarianFraction: 0.1,
    voronoiGrain: 10.0,
    noiseScale: 1.3,
    cultureNoiseScale: 1.0,
  },
  loyalty: {
    neighborPressureStrength: 1.0,
    breakawayThreshold: -1,
    momentumRate: 0.2,
  },
};
