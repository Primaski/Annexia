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
    breakawayThreshold: number;       // [-1, 1] range. Tile secedes when loyalty falls to or below this value.
    secessionWarningThreshold: number; // [-1, 1] range. Tile triggers a warning notification when loyalty crosses below this value.
    momentumRate: number;             // Drift speed toward target. Percentage of gap closed per turn.
  };
  policy: {
    tribuneSentimentShift: number; // How much a tribune's sentiment shifts per policy interaction.
    vetoCeilingDemocracy: number;  // Max veto probability in a democracy (applied × |bias|).
    vetoCeilingHybrid: number;     // Max veto probability in a hybrid government.
    vetoCeilingAutocracy: number;  // Max veto probability in an autocracy (typically 0).
    alignmentDriftScale: number;   // Multiplier applied to alignmentShift when updating player alignment.
    loyaltyModifierScale: number;  // Multiplier applied to alignmentShift when computing tile loyalty deltas.
  };
  mobilization: {
    startingAP: number;        // Action points available at the start of each mobilization phase.
    fortifyAPCost: number;     // Flat AP cost to fortify a tile (troop move).
    annexAPCost: number;       // Flat AP cost to annex one unclaimed tile.
    annexTroopMin: number;     // Minimum troops that must be committed to annex.
    invadeAPCost: number;      // Flat AP cost to launch an invasion.
    invadeTroopMin: number;    // Minimum troops that must be committed to invade.
    spawnTroops: number;       // Troops placed on a player's spawn tile at game start.
    startingBudget: number;    // Budget given to each player at game start.
    troopIncomeSuspendThreshold: number;   // [-1, 1]. Avg tile loyalty below this disables troop_income effects.
    budgetIncomeSuspendThreshold: number;  // [-1, 1]. Avg tile loyalty below this disables budget_income effects.
  };
  combat: {
    lanchesterExponent: number; // Controls how steeply army size matters in win probability. Default 3.
    defenderBonus: number;      // Multiplier applied to defender strength before computing odds. Default 1.07.
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
    breakawayThreshold: -0.8,
    secessionWarningThreshold: -0.5,
    momentumRate: 0.1,
  },
  policy: {
    tribuneSentimentShift: 0.15,
    vetoCeilingDemocracy: 0.50,
    vetoCeilingHybrid: 0.25,
    vetoCeilingAutocracy: 0.00,
    alignmentDriftScale: 4.0,
    loyaltyModifierScale: 6.0,
  },
  mobilization: {
    startingAP: 20,
    fortifyAPCost: 1,
    annexAPCost: 5,
    annexTroopMin: 1,
    invadeAPCost: 10,
    invadeTroopMin: 5,
    spawnTroops: 8,
    startingBudget: 90,
    troopIncomeSuspendThreshold: -0.15,
    budgetIncomeSuspendThreshold: -0.35,
  },
  combat: {
    lanchesterExponent: 3,
    defenderBonus: 1.07,
  },
};
