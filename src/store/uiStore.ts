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

  /**
   * The id of the human player whose perspective the UI is rendering.
   * Set once at game start; null before the game begins.
   */
  viewingPlayerId: string | null;

  // ── Map Interaction ───────────────────────────────────────────────────────
  /**
   * The axial coord of the currently selected tile, or null if none.
   * Set by clicking a HexTile; read by TileDetailPanel to show tile details.
   */
  selectedTileCoord: AxialCoord | null;

  /** The axial coord of the tile the mouse is currently over, or null. */
  hoveredTileCoord: AxialCoord | null;

  /** Current mouse position in client (viewport) coordinates. */
  tooltipPosition: { x: number; y: number };

  /** Which data overlay is active on the map, and whether it is inverted. */
  activeOverlay: { trait: keyof TraitVector | 'loyalty'; inverted: boolean } | null;

  // ── Pending Policy Cards ──────────────────────────────────────────────────
  /**
   * Index of which policy card the player is currently viewing (0, 1, or 2).
   * Policy cards are an array in the game state; this just tracks which one is shown.
   */
  activePolicyCardIndex: number;

  /**
   * Which choice button (0 = first, 1 = second) the player is hovering on the
   * active policy card, or null if not hovering. Used to drive the loyalty
   * preview overlay on the map without touching engine state.
   */
  policyHoverChoice: 0 | 1 | null;

  // ── Annex Draft ───────────────────────────────────────────────────────────
  /** True while the player is selecting troop sources for a pending annex. */
  draftModeActive: boolean;
  /** True while the player is specifically in invade draft mode (restricts highlight to adjacent tiles). */
  invadeModeActive: boolean;
  /** The coordKey of the tile the player is drafting an annex toward. */
  draftClickKey: string | null;
  /** Troops allocated from each source tile during the current draft session. */
  draftSources: Record<string, number>;
  setDraftModeActive: (active: boolean) => void;
  setInvadeModeActive: (active: boolean) => void;
  setDraftClickKey: (key: string | null) => void;
  setDraftSources: (sources: Record<string, number>) => void;

  // ── Veto ──────────────────────────────────────────────────────────────────
  vetoResult: { policyId: string; tribuneId: string; originalChoiceIndex: number; finalChoiceIndex: number } | null;
  setVetoResult: (result: { policyId: string; tribuneId: string; originalChoiceIndex: number; finalChoiceIndex: number }) => void;
  clearVetoResult: () => void;

  // ── Simulation ────────────────────────────────────────────────────────────
  simulationMode: boolean;
  simAutoAdvance: boolean;
  setSimulationMode: (v: boolean) => void;
  setSimAutoAdvance: (v: boolean) => void;

  // ─── Actions ──────────────────────────────────────────────────────────────

  setScreen: (screen: ScreenState) => void;

  /** Called when a player clicks a hex tile. Pass null to deselect. */
  selectTile: (coord: AxialCoord | null) => void;

  setHoveredTile: (coord: AxialCoord | null) => void;

  setTooltipPosition: (pos: { x: number; y: number }) => void;

  setActiveOverlay: (overlay: { trait: keyof TraitVector | 'loyalty'; inverted: boolean } | null) => void;

  setActivePolicyCardIndex: (index: number) => void;

  setPolicyHoverChoice: (choice: 0 | 1 | null) => void;

  setViewingPlayerId: (id: string | null) => void;

  /** Close all open panels — useful when transitioning between phases. */
  closeAllPanels: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  screen: 'setup',
  viewingPlayerId: null,
  simulationMode: false,
  simAutoAdvance: false,
  selectedTileCoord: null,
  hoveredTileCoord: null,
  tooltipPosition: { x: 0, y: 0 },
  activeOverlay: null,
  activePolicyCardIndex: 0,
  policyHoverChoice: null,
  draftModeActive: false,
  invadeModeActive: false,
  draftClickKey: null,
  draftSources: {},
  vetoResult: null,

  setSimulationMode: (simulationMode) => set({ simulationMode }),
  setSimAutoAdvance: (simAutoAdvance) => set({ simAutoAdvance }),

  setScreen: (screen) => set({ screen }),

  setViewingPlayerId: (viewingPlayerId) => set({ viewingPlayerId }),

  selectTile: (selectedTileCoord) => set({ selectedTileCoord }),

  setHoveredTile: (hoveredTileCoord) => set({ hoveredTileCoord }),

  setTooltipPosition: (tooltipPosition) => set({ tooltipPosition }),

  setActiveOverlay: (activeOverlay) => set({ activeOverlay }),

  setActivePolicyCardIndex: (activePolicyCardIndex) =>
    set({ activePolicyCardIndex }),

  setPolicyHoverChoice: (policyHoverChoice) => set({ policyHoverChoice }),

  closeAllPanels: () =>
    set({ selectedTileCoord: null, policyHoverChoice: null }),

  setDraftModeActive: (draftModeActive) => set({ draftModeActive }),
  setInvadeModeActive: (invadeModeActive) => set({ invadeModeActive }),
  setDraftClickKey: (draftClickKey) => set({ draftClickKey }),
  setDraftSources: (draftSources) => set({ draftSources }),

  setVetoResult: (vetoResult) => set({ vetoResult }),

  clearVetoResult: () => set({ vetoResult: null }),
}));
