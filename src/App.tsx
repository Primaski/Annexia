/**
 * App.tsx — Root component. Handles screen routing.
 *
 * Phase 1: Map + side panel rendered side by side.
 * Phase 3+: Route between SetupScreen, GameScreen, and EndScreen via uiStore.
 *
 * RULE: Routing and top-level wiring only. No game logic here.
 */

import { useEffect } from 'react';
import { useMapGen, startPolicyPhase, startMobilizationPhase, advanceSimStep } from './hooks/useGame';
import { useUIStore } from './store/uiStore';
import { useGameStore } from './store/gameStore';
import { coordKey } from './engine/hex';
import type { OwnedTile } from './types';
import { HexGrid } from './components/map/HexGrid';
import { BottomBar } from './components/ui/BottomBar';
import { NotificationPanel } from './components/ui/NotificationBubbles';
import { HoverTooltip } from './components/ui/HoverTooltip';
import { TileDetailPanel } from './components/ui/TileDetailPanel';
import { ActionBar } from './components/ui/ActionBar';
import { EffectsBar } from './components/ui/EffectsBar';
import { ToastLayer } from './components/ui/ToastLayer';

export default function App() {
  useMapGen();

  const phase             = useGameStore((state) => state.phase);
  const currentTurn       = useGameStore((state) => state.currentTurn);
  const actionsRemaining  = useGameStore((state) => state.actionsRemaining);
  const players           = useGameStore((state) => state.players);
  const tiles             = useGameStore((state) => state.tiles);
  const spentTroopsByTile = useGameStore((state) => state.spentTroopsByTile);
  const humanPlayer = players.find((p) => p.isHuman);
  const ownedHumanTiles = humanPlayer
    ? Object.values(tiles).filter((t): t is OwnedTile => t.state === 'owned' && (t as OwnedTile).ownerId === humanPlayer.id)
    : [];
  const totalTroops = ownedHumanTiles.reduce((sum, t) => sum + t.activeTroops, 0);
  const availableTroops = humanPlayer
    ? ownedHumanTiles.reduce((sum, t) => {
        const key = coordKey(t.coord);
        return sum + Math.max(0, t.activeTroops - (spentTroopsByTile[key] ?? 0));
      }, 0)
    : 0;

  useEffect(() => {
    if (phase === 'policy') {
      startPolicyPhase();
    }
    if (phase === 'mobilization') {
      startMobilizationPhase();
    }
  }, [phase]);

  const simulationMode = useUIStore((state) => state.simulationMode);
  const simAutoAdvance = useUIStore((state) => state.simAutoAdvance);

  useEffect(() => {
    if (!simulationMode || !simAutoAdvance) return;
    const timer = setTimeout(() => advanceSimStep(), 3000);
    return () => clearTimeout(timer);
  }, [simulationMode, simAutoAdvance, phase]);

  const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: '#0f1923',
        }}
      >
        {/* INFO BAR */}
        <div
          style={{
            flexShrink: 0,
            height: '50px',
            width: '100%',
            background: '#0f1923',
            borderBottom: '1px solid #1e2d3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#c0c8d0',
          }}
        >
          <span>Turn {currentTurn} — {phaseLabel}</span>
          <span>⚔️ {availableTroops}/{totalTroops}&nbsp;&nbsp;&nbsp;AP: {actionsRemaining}{humanPlayer ? `   💰 ${Math.floor(humanPlayer.budget)}` : ''}</span>
        </div>

        {/* THREE-COLUMN MIDDLE ROW */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* NOTIFICATION BAR */}
          <div
            style={{
              minWidth: '200px',
              width: '200px',
              flexShrink: 1,
              height: '100%',
              background: '#0f1923',
              borderRight: '1px solid #1e2d3a',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <NotificationPanel />
          </div>

          {/* MAP AREA */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: '#0f1923',
              position: 'relative',
              overflow: 'hidden',
              zIndex: 0,
            }}
          >
            <HexGrid />
            <TileDetailPanel />
            <EffectsBar />
          </div>

          {/* ACTION BAR */}
          <div
            style={{
              minWidth: '210px',
              width: '420px',
              flexShrink: 1,
              height: '100%',
              background: '#0f1923',
              borderLeft: '1px solid #1e2d3a',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <ActionBar />
          </div>
        </div>

        {/* SETTINGS BAR */}
        <div
          style={{
            flexShrink: 0,
            height: '40px',
            width: '100%',
            background: '#0f1923',
            borderTop: '1px solid #1e2d3a',
          }}
        >
          <BottomBar />
        </div>
        <ToastLayer />
      </div>

      <HoverTooltip />
    </>
  );
}
