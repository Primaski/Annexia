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

export interface ToastMessage {
  id: string;
  message: string;
  x: number;
  y: number;
  variant: 'success' | 'error';
}

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

  // ── Pending Action ────────────────────────────────────────────────────────
  pendingAction: {
    destinationKey: string;
    actionType: 'fortify' | 'annex' | 'invade';
    sources: Record<string, number>;
  } | null;

  setPendingAction: (action: { destinationKey: string; actionType: 'fortify' | 'annex' | 'invade'; sources: Record<string, number> } | null) => void;
  /** Adds or merges a source into pendingAction.sources. No-op if pendingAction is null. */
  addPendingSource: (sourceKey: string, count: number, max?: number) => void;
  /** Increments/decrements a source's troop count. Floors at 0. No-op if pendingAction is null or sourceKey not in sources. */
  adjustPendingSource: (sourceKey: string, delta: number, max?: number) => void;
  /** Sets pendingAction to null. */
  clearPendingAction: () => void;

  // ── Veto ──────────────────────────────────────────────────────────────────
  vetoResult: { policyId: string; tribuneId: string; originalChoiceIndex: number; finalChoiceIndex: number } | null;
  setVetoResult: (result: { policyId: string; tribuneId: string; originalChoiceIndex: number; finalChoiceIndex: number }) => void;
  clearVetoResult: () => void;

  // ── Toast Queue ───────────────────────────────────────────────────────────
  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;

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
  pendingAction: null,
  vetoResult: null,
  toasts: [],

  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }],
    })),

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

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
    set({ selectedTileCoord: null, policyHoverChoice: null, pendingAction: null }),

  setPendingAction: (action) => { console.log('setPendingAction called', JSON.stringify(action)); set({ pendingAction: action }); },

  addPendingSource: (sourceKey, count, max) =>
    set((state) => {
      console.log('addPendingSource called', sourceKey, count);
      if (state.pendingAction === null) return state;
      const current = state.pendingAction.sources[sourceKey] ?? 0;
      const next = current + count;
      const capped = max !== undefined ? Math.min(next, max) : next;
      return {
        pendingAction: {
          ...state.pendingAction,
          sources: { ...state.pendingAction.sources, [sourceKey]: Math.max(0, capped) },
        },
      };
    }),

  adjustPendingSource: (sourceKey, delta, max) =>
    set((state) => {
      if (state.pendingAction === null || !(sourceKey in state.pendingAction.sources)) return state;
      const next = state.pendingAction.sources[sourceKey] + delta;
      const capped = max !== undefined ? Math.min(next, max) : next;
      return {
        pendingAction: {
          ...state.pendingAction,
          sources: {
            ...state.pendingAction.sources,
            [sourceKey]: Math.max(0, capped),
          },
        },
      };
    }),

  clearPendingAction: () => set({ pendingAction: null }),

  setVetoResult: (vetoResult) => set({ vetoResult }),

  clearVetoResult: () => set({ vetoResult: null }),
}));
