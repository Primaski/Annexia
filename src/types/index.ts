/**
 * types/index.ts — All shared TypeScript interfaces for Annexia.
 *
 * These interfaces define the "shape" of every major data structure in the game.
 * They let TypeScript catch errors like accessing tile.owner when the field is
 * actually called tile.ownerId, or passing a loyalty value of 150 when the max is 100.
 *
 * CONVENTION: Types that mirror JSON file schemas are prefixed with the file name
 * (Advisor, Policy, GameEvent, AIPersonality). Runtime game-state types are more
 * descriptive (Tile, Player, GameState, etc.).
 *
 * Coordinate types (AxialCoord, PixelCoord, etc.) live in engine/hex.ts and are
 * imported here for re-export — so the rest of the codebase can import everything
 * from one place: import type { Tile, AxialCoord } from '../types'.
 */

import type { AxialCoord, PixelCoord } from '../engine/hex';
export type { AxialCoord, PixelCoord };

// ─── Trait / Alignment System ─────────────────────────────────────────────────

/**
 * The five traits that describe a culture or alignment.
 * Each value is a float between 0 and 1.
 *
 * These are not moral judgments — they're just what a population values.
 * A tile with ecology=0.9 strongly prioritizes environmental protection.
 * A player with militarism=0.8 has consistently made pro-military policy choices.
 */
export interface TraitVector {
  ecology: number;       // Environmental protection vs. industrial growth
  militarism: number;    // Expansion and defense vs. pacifism
  religion: number;      // Religious identity vs. secularism
  liberty: number; // Personal freedoms vs. collective control
  progress: number; // Openness to change vs. tradition
}

export type GovernmentType = 'none' | 'democracy' | 'hybrid' | 'autocracy';

// ─── JSON Data Types (advisors.json) ─────────────────────────────────────────

/**
 * One tribune entry from advisors.json.
 * Tribunes are selected by the player at game start and influence policy
 * recommendations, alignment drift, and available mobilization actions.
 */
export interface Tribune {
  id: string;           // e.g. "adv_environmentalist" — must be unique
  name: string;         // Display name: "Dr. Mara Voss"
  archetype: string;    // e.g. "environmentalist" — used for grouping / flavor
  traitWeights: TraitVector; // What this tribune values; drives their policy biases
  /**
   * Per-policy preference scores from -1.0 (strongly oppose) to 1.0 (strongly endorse).
   * Keys are policy IDs from policies.json. Unlisted policies = neutral (0).
   */
  policyBias: Record<string, number>;
  flavourText: string;       // Short quote displayed in the tribune panel
  imagePath: string | null;  // Path to portrait image; null until Phase 4
}

export interface Advisor {
  id: string;
  name: string;
  flavourText: string;
  imagePath: string | null;
}

// ─── JSON Data Types (policies.json) ─────────────────────────────────────────

/**
 * A filter that targets tiles whose culture vector has a specific trait
 * above (or below) a threshold. Used to scope loyalty effects.
 *
 * Example: { trait: "ecology", threshold: 0.6 } targets high-ecology tiles.
 */
export interface LoyaltyFilter {
  trait: keyof TraitVector;
  threshold: number;  // 0.0–1.0; tiles with trait value above this are affected
  above?: boolean;    // default true; set false to target tiles BELOW threshold
}

/** The loyalty change applied to tiles matching the filter. */
export interface LoyaltyEffect {
  filter: LoyaltyFilter;
  modifier: number; // Flat change to loyalty (e.g. -12 or +6)
}

/** One choice option within a policy card. */
export interface PolicyChoice {
  label: string;                        // Button text: "Approve" / "Reject"
  alignmentShift: Partial<TraitVector>; // How this choice shifts the player's alignment
  loyaltyEffect: LoyaltyEffect;         // Which tiles are affected and by how much
  flavour: string;                      // Short flavor text shown after choosing
}

/** One policy card from policies.json. */
export interface Policy {
  id: string;          // e.g. "pol_coal_subsidies"
  title: string;       // Display title
  description: string; // Flavor description shown on the card
  tags: string[];      // e.g. ["economic", "energy"] — used for filtering / weighting
  weight: number;      // Base probability weight for being drawn (1.0 = normal)
  choices: PolicyChoice[];
}

// ─── JSON Data Types (events.json) ───────────────────────────────────────────

export type EventTrigger =
  | 'random'            // Fires based on weight roll at turn end
  | 'player_triggered'; // Costs an action, player chooses to trigger it

export type EventEffectType =
  | 'loyalty_penalty'
  | 'loyalty_bonus'
  | 'military_penalty'
  | 'military_bonus'
  | 'alignment_shift'
  | 'defense_bonus';

export type EventScope =
  | 'random_cluster'  // A spatially connected group of tiles
  | 'all_tiles'       // Every tile the player owns
  | 'border_tiles'    // Tiles adjacent to another player's territory
  | 'specific_player' // Targets one player (attacker or target, context-dependent)
  | 'global';         // Affects all players

export interface EventEffect {
  type: EventEffectType;
  scope: EventScope;
  amount: number;   // Magnitude of the effect (positive or negative)
  duration: number; // How many turns the effect lasts (1 = this turn only)
}

/** One random event from events.json. */
export interface GameEvent {
  id: string;
  title: string;
  description: string;
  trigger: EventTrigger;
  weight: number;   // Relative probability weight (higher = more common)
  effect: EventEffect;
}

// ─── JSON Data Types (ai_personalities.json) ─────────────────────────────────

/**
 * Per-difficulty noise values for AI decision-making.
 * Higher noise = more random and suboptimal play.
 */
export interface DecisionNoise {
  easy: number;   // e.g. 0.5 — AI frequently makes poor choices
  medium: number; // e.g. 0.25
  hard: number;   // e.g. 0.08 — AI plays near-optimally
}

/** One AI personality from ai_personalities.json. */
export interface AIPersonality {
  id: string;               // e.g. "ai_expansionist"
  name: string;             // Display name: "Expansionist"
  traitVector: TraitVector; // Drives policy preferences (same space as tile culture)
  aggression: number;       // 0–1: how likely to invade vs. consolidate
  expansionism: number;     // 0–1: how much it prioritizes growing territory
  decisionNoise: DecisionNoise;
}

// ─── Tile Types ───────────────────────────────────────────────────────────────

/**
 * Internal base types — not exported. Use the specific tile types or Tile union below.
 *
 * BaseTile: fields present on every tile regardless of state.
 * LandTile: extends BaseTile with cultureVector, present on all non-water tiles.
 */
interface BaseTile {
  coord: AxialCoord; // Axial position on the grid (immutable after generation)
}

interface LandTile extends BaseTile {
  cultureVector: TraitVector; // This tile's cultural identity (generated, mostly immutable)
}

/**
 * Water tiles are impassable and unclaimable. No culture, no ownership.
 */
export type WaterTile = BaseTile & { state: 'water' };

/**
 * Unclaimed land. No owner, no loyalty. Available for annexation.
 */
export type UnclaimedTile = LandTile & { state: 'unclaimed' };

/**
 * Barbarian-controlled land. Has a defense value set at generation.
 * Can be claimed via Invade. Defense does not regenerate.
 */
export type BarbarianTile = LandTile & {
  state: 'barbarian';
  defense: number; // 0–100. Randomly assigned at generation (20–60).
};

/**
 * Player-owned land. Carries the full loyalty and suppression state.
 * Loyalty and loyaltyTarget are both set to the cultural alignment score
 * when ownership changes — no carryover from the previous owner.
 */
export type OwnedTile = LandTile & {
  state: 'owned';
  ownerId: string;       // References Player.id
  loyalty: number;       // Internal units [-10000, +10000]. Divide by LOYALTY_SCALE for display.
  loyaltyTarget: number; // Internal units [-10000, +10000]. Divide by LOYALTY_SCALE for display.
  activeTroops: number;  // Per-tile troop count. [0, MAX]. Starts at 10 on spawn tile, 0 on all other owned tiles.
  suppression: number;   // 0–100. Slows loyalty decay; builds hidden resentment.
  defense: number;       // 0–100. Starts at 0 (from unclaimed) or inherited (from barbarian).
};

/**
 * The central data unit of the game.
 * Created by mapGen.ts, owned by the Zustand store, rendered by HexTile.tsx.
 *
 * Always narrow the state before accessing state-specific fields:
 *   if (tile.state === 'owned') { tile.loyalty ... }
 */
export type Tile = WaterTile | UnclaimedTile | BarbarianTile | OwnedTile;

// ─── Player ───────────────────────────────────────────────────────────────────

/**
 * One player in the game — either human or AI.
 */
export interface Player {
  id: string;                    // e.g. "player_1", "ai_expansionist_1"
  name: string;                  // Display name
  isHuman: boolean;
  alignmentVector: TraitVector;  // Shifts with every policy decision
  confidence: number;            // [0, 1]. Affects propaganda and smear actions.
  governmentType: GovernmentType;
  tribuneIds: string[];          // IDs of selected tribunes (2–3 entries)
  advisorId: string | null;
  personalityId: string | null;  // AI only; references ai_personalities.json
}

// ─── Turn / Phase State ───────────────────────────────────────────────────────

/**
 * The two main phases of each turn.
 * 'resolution' is a brief interstitial while breakaways / events are applied.
 */
export type TurnPhase = 'roundtable' | 'policy' | 'calibration' | 'mobilization';

export type RoundtableReason =
  | 'game_start'
  | 'invasion'
  | 'breakaway'
  | 'public_disapproval'
  | 'government_change'
  | 'war_declared'
  | 'peace_declared';

/** The high-level screen the player is looking at. */
export type ScreenState = 'setup' | 'game' | 'end';

// ─── Win Conditions ───────────────────────────────────────────────────────────

export type WinCondition =
  | 'majority'   // Own > 50% of land tiles
  | 'dominance'  // Own all tiles (last player standing)
  | 'time_limit' // Most tiles after N turns
  | 'stability'; // Average loyalty ≥ 75 for 3 consecutive turns

/**
 * Player-facing game setup choices. Selected on the setup screen before the game starts.
 * Map dimensions live here (player choice), not in TuningConfig (engine defaults).
 */
export interface GameConfig {
  winCondition: WinCondition;
  turnLimit: number | null; // Only used when winCondition === 'time_limit'
  mapCols: number;
  mapRows: number;
  playerCount: number;      // Total players including AI
}
