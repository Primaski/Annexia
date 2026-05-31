/**
 * gameStore.ts — Global game state via Zustand.
 *
 * ─── WHAT IS ZUSTAND? ────────────────────────────────────────────────────────
 *
 * Zustand is a lightweight state management library. It replaces "prop drilling"
 * (passing data down through many component layers) with a global store that
 * any component can read from or write to directly.
 *
 * Basic usage:
 *   const tiles = useGameStore(state => state.tiles);       // read
 *   const setPhase = useGameStore(state => state.setPhase); // write
 *
 * Zustand only re-renders a component when the specific slice it subscribes to
 * actually changes — so reading `tiles` won't cause a re-render when `phase` changes.
 *
 * ─── WHAT LIVES HERE ─────────────────────────────────────────────────────────
 *
 * Everything that is part of the active game session:
 *   - Map tiles
 *   - Players and their state
 *   - Current turn and phase
 *   - Active game config
 *
 * What does NOT live here:
 *   - UI-only state (selected tile, open panels, hover state) → uiStore.ts
 *   - Derived/computed values → calculate them in components or useGame.ts
 *
 * ─── RULE ─────────────────────────────────────────────────────────────────────
 *
 * Actions in this store should only update state. Game logic (loyalty formulas,
 * breakaway rolls, policy effects) lives in the engine/ files and is called
 * via useGame.ts hooks, which then call these actions.
 */

import { create } from 'zustand';
import type { Tile, Player, TurnPhase, GameConfig, WinCondition, Policy, RoundtableReason, Nation, Tribune, Notification } from '../types';

// ─── Default Values ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GameConfig = {
  winCondition: 'majority' as WinCondition,
  turnLimit: null,
  mapCols: 30,
  mapRows: 30,
  playerCount: 2 ,
};

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface GameState {
  // ── Map ──────────────────────────────────────────────────────────────────
  /**
   * All tiles on the map, keyed by coordKey(tile.coord) → e.g. "3,-1".
   * Using a Record lets you look up a tile in O(1): tiles["3,-1"].
   * Populated by mapGen.ts during setup; mutated by mobilization actions.
   */
  tiles: Record<string, Tile>;
  /** All nations on the map, keyed by nation id. */
  nations: Record<string, Nation>;
  /** Tribune roster loaded from tribunes.json at game start. */
  tribunes: Tribune[];

  // ── Players ───────────────────────────────────────────────────────────────
  /**
   * All players (human + AI). Order matters: index 0 is typically the human.
   * Use player.id as the foreign key when referencing from tiles.
   */
  players: Player[];

  // ── Turn Tracking ─────────────────────────────────────────────────────────
  currentTurn: number;       // Starts at 1
  phase: TurnPhase;          // Current phase within the turn
  /**
   * ID of the player currently taking their mobilization turn.
   * null during policy phase (all players act simultaneously).
   */
  activePlayerId: string | null;
  /**
   * IDs of players who have submitted their policy choices this turn.
   * Once this equals players.length, the policy phase resolves.
   */
  submittedPlayerIds: string[];

  // ── Roundtable ────────────────────────────────────────────────────────────
  /** Whether a roundtable phase should be inserted at the start of the next turn. */
  pendingRoundtable: boolean;
  /** What triggered the pending roundtable. Null when pendingRoundtable is false. */
  roundtableReason: RoundtableReason | null;

  // ── Mobilization ──────────────────────────────────────────────────────────
  /** Actions remaining for the current player during mobilization. */
  actionsRemaining: number;
  /** Log of troop movements made this mobilization phase. Cleared on advanceTurn. */
  relocatedTroops: { fromKey: string; toKey: string; count: number; ownerId: string }[];
  /** Running tally of troops committed from each tile this phase. Used by getTotalAvailableTroops. */
  spentTroopsByTile: Record<string, number>;
  recordTroopRelocation: (entry: { fromKey: string; toKey: string; count: number; ownerId: string }) => void;
  clearRelocations: () => void;

  // ── Config ────────────────────────────────────────────────────────────────
  config: GameConfig;

  // ── Win/Loss ──────────────────────────────────────────────────────────────
  winnerId: string | null;  // Set when a win condition is met; triggers EndScreen

  // ── Map Seed ──────────────────────────────────────────────────────────────
  mapSeed: number | null;   // Seed used for map generation; null before first gen

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: Notification[];

  // ── Policy Phase ──────────────────────────────────────────────────────────
  /** Cards dealt to the human player for the current policy phase. Cleared on resolution. */
  activePolicyCards: Policy[];
  /** Index of the card the player is currently resolving within activePolicyCards. */
  currentPolicyCardIndex: number;

  // ─── Actions ──────────────────────────────────────────────────────────────
  // Naming convention: verbs that describe what changes, not what triggers it.

  /** Replace the entire tile map (called once by mapGen at game start). */
  setTiles: (tiles: Record<string, Tile>) => void;

  /** Update a single tile (e.g. after annexation, suppression, loyalty shift). */
  updateTile: (key: string, patch: Partial<Tile>) => void;

  /** Replace the full nations record (called once at game start). */
  setNations: (nations: Record<string, Nation>) => void;

  /** Add or replace a single nation (used when minting breakaway nations mid-game). */
  addNation: (nation: Nation) => void;

  /** Load the tribune roster (called once at game start). */
  setTribunes: (tribunes: Tribune[]) => void;

  /** Replace the player list (called once at game start). */
  setPlayers: (players: Player[]) => void;

  /** Update one player's data (e.g. after spending military strength). */
  updatePlayer: (id: string, patch: Partial<Player>) => void;

  /** Advance to a new phase. */
  setPhase: (phase: TurnPhase) => void;

  /** Set which player is currently acting during mobilization. */
  setActivePlayer: (playerId: string | null) => void;

  /** Mark a player as having submitted their policy choices. */
  markPolicySubmitted: (playerId: string) => void;

  /** Advance the turn counter and reset per-turn state. */
  advanceTurn: () => void;

  /**
   * Schedule a roundtable for the start of the next turn.
   * Pass null to clear a pending roundtable without triggering one.
   */
  setPendingRoundtable: (reason: RoundtableReason | null) => void;

  /** Decrement actionsRemaining by 1. Floor at 0. */
  spendAction: () => void;

  /** Set actionsRemaining directly (called at the start of mobilization). */
  setActionsRemaining: (n: number) => void;

  /** Record a winner and end the game. */
  setWinner: (playerId: string) => void;

  /** Store the seed used for the current map generation. */
  setMapSeed: (seed: number) => void;

  setActivePolicyCards: (cards: Policy[]) => void;
  setCurrentPolicyCardIndex: (n: number) => void;

  addNotification: (n: Notification) => void;
  dismissNotification: (id: string) => void;

  /** Update the game config (called during setup). */
  setConfig: (config: Partial<GameConfig>) => void;

  /**
   * Reset everything back to defaults.
   * Call this when returning to the setup screen for a new game.
   */
  resetGame: () => void;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState = {
  tiles: {} as Record<string, Tile>,
  nations: {} as Record<string, Nation>,
  tribunes: [] as Tribune[],
  players: [] as Player[],
  currentTurn: 1,
  phase: 'policy' as TurnPhase,
  activePlayerId: null,
  submittedPlayerIds: [] as string[],
  pendingRoundtable: false,
  roundtableReason: null,
  actionsRemaining: 0,
  relocatedTroops: [] as { fromKey: string; toKey: string; count: number; ownerId: string }[],
  spentTroopsByTile: {} as Record<string, number>,
  config: DEFAULT_CONFIG,
  winnerId: null,
  mapSeed: null,
  activePolicyCards: [] as Policy[],
  currentPolicyCardIndex: 0,
  notifications: [] as Notification[],
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setTiles: (tiles) => set({ tiles }),

  setNations: (nations) => set({ nations }),

  setTribunes: (tribunes) => set({ tribunes }),

  addNation: (nation) =>
    set((state) => ({ nations: { ...state.nations, [nation.id]: nation } })),

  updateTile: (key, patch) =>
    set((state) => ({
      tiles: {
        ...state.tiles,
        [key]: { ...state.tiles[key], ...patch } as Tile,
      },
    })),

  setPlayers: (players) => set({ players }),

  updatePlayer: (id, patch) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  setPhase: (phase) => set({ phase }),

  setActivePlayer: (activePlayerId) => set({ activePlayerId }),

  markPolicySubmitted: (playerId) =>
    set((state) => ({
      submittedPlayerIds: [...state.submittedPlayerIds, playerId],
    })),

  recordTroopRelocation: (entry) =>
    set((state) => ({
      relocatedTroops: [...state.relocatedTroops, entry],
      spentTroopsByTile: {
        ...state.spentTroopsByTile,
        [entry.fromKey]: (state.spentTroopsByTile[entry.fromKey] ?? 0) + entry.count,
      },
    })),

  clearRelocations: () => set({ relocatedTroops: [], spentTroopsByTile: {} }),

  advanceTurn: () =>
    set((state) => ({
      currentTurn: state.currentTurn + 1,
      phase: state.pendingRoundtable ? 'roundtable' : 'policy',
      activePlayerId: null,
      submittedPlayerIds: [],
      actionsRemaining: 0,
      relocatedTroops: [],
      spentTroopsByTile: {},
    })),

  setPendingRoundtable: (reason) =>
    set({ pendingRoundtable: reason !== null, roundtableReason: reason }),

  spendAction: () =>
    set((state) => ({ actionsRemaining: Math.max(0, state.actionsRemaining - 1) })),

  setActionsRemaining: (actionsRemaining) => set({ actionsRemaining }),

  setActivePolicyCards: (activePolicyCards) => set({ activePolicyCards }),

  setCurrentPolicyCardIndex: (currentPolicyCardIndex) => set({ currentPolicyCardIndex }),

  addNotification: (n) =>
    set((state) => ({ notifications: [...state.notifications, n] })),

  dismissNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),

  setWinner: (winnerId) => set({ winnerId }),

  setMapSeed: (mapSeed) => set({ mapSeed }),

  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })),

  resetGame: () => set({ ...initialState, config: DEFAULT_CONFIG }),
}));
