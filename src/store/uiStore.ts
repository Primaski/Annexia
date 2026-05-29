/**
 * uiStore.ts — UI-only state via Zustand.
 *
 * This store holds state that affects what's displayed but has no game logic
 * consequences. Nothing in the engine/ folder should ever touch this store.
 *
 * The split between uiStore and gameStore is important:
 *   - gameStore: "what is true about the game world" (who owns what, loyalty values, etc.)
 *   - uiStore:   "what is the player looking at" (selected tile, open panels, active overlay)
 *
 * This separation makes it easy to reset the UI without resetting the game,
 * and keeps game-state logic free from rendering concerns.
 */

import { create } from 'zustand';
import type { AxialCoord, ScreenState, TraitVector } from '../types';

// ─── Map Overlay Types ────────────────────────────────────────────────────────

/**
 * Which data layer to render on top of the hex map.
 * 'owner' = colored by player; 'loyalty' = heatmap; 'defense' = strength overlay.
 * Implemented in Phase 4 — just define the type now.
 */
export type MapOverlay = 'owner' | 'loyalty' | 'defense' | 'none';

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface UIState {
  // ── Screen Routing ────────────────────────────────────────────────────────
  /** Which top-level screen is displayed. App.tsx uses this to decide what to render. */
  screen: ScreenState;

  // ── Map Interaction ───────────────────────────────────────────────────────
  /**
   * The axial coord of the currently selected tile, or null if none.
   * Set by clicking a HexTile; read by SidePanel to show tile details.
   */
  selectedTileCoord: AxialCoord | null;

  /** Which data overlay is active on the map, and whether it is inverted. */
  activeOverlay: { trait: keyof TraitVector | 'loyalty'; inverted: boolean } | null;

  // ── Panel Visibility ──────────────────────────────────────────────────────
  /** Whether the advisor panel is open. */
  advisorPanelOpen: boolean;

  /** Whether the intel feed (mobilization log) is visible. */
  intelFeedOpen: boolean;

  // ── Pending Policy Cards ──────────────────────────────────────────────────
  /**
   * Index of which policy card the player is currently viewing (0, 1, or 2).
   * Policy cards are an array in the game state; this just tracks which one is shown.
   */
  activePolicyCardIndex: number;

  // ─── Actions ──────────────────────────────────────────────────────────────

  setScreen: (screen: ScreenState) => void;

  /** Called when a player clicks a hex tile. Pass null to deselect. */
  selectTile: (coord: AxialCoord | null) => void;

  setActiveOverlay: (overlay: { trait: keyof TraitVector | 'loyalty'; inverted: boolean } | null) => void;

  toggleAdvisorPanel: () => void;

  toggleIntelFeed: () => void;

  setActivePolicyCardIndex: (index: number) => void;

  /** Close all open panels — useful when transitioning between phases. */
  closeAllPanels: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  screen: 'setup',
  selectedTileCoord: null,
  activeOverlay: null,
  advisorPanelOpen: false,
  intelFeedOpen: false,
  activePolicyCardIndex: 0,

  setScreen: (screen) => set({ screen }),

  selectTile: (selectedTileCoord) => set({ selectedTileCoord }),

  setActiveOverlay: (activeOverlay) => set({ activeOverlay }),

  toggleAdvisorPanel: () =>
    set((state) => ({ advisorPanelOpen: !state.advisorPanelOpen })),

  toggleIntelFeed: () =>
    set((state) => ({ intelFeedOpen: !state.intelFeedOpen })),

  setActivePolicyCardIndex: (activePolicyCardIndex) =>
    set({ activePolicyCardIndex }),

  closeAllPanels: () =>
    set({ advisorPanelOpen: false, intelFeedOpen: false, selectedTileCoord: null }),
}));
