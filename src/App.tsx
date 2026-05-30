/**
 * App.tsx — Root component. Handles screen routing.
 *
 * Phase 1: Map + side panel rendered side by side.
 * Phase 3+: Route between SetupScreen, GameScreen, and EndScreen via uiStore.
 *
 * RULE: Routing and top-level wiring only. No game logic here.
 */

import { useMapGen } from './hooks/useGame';
import { HexGrid } from './components/map/HexGrid';
import { SidePanel } from './components/ui/SidePanel';
import { PhaseBanner } from './components/ui/PhaseBanner';
import { RoundtableOverlay } from './components/ui/RoundtableOverlay';
import { BottomBar } from './components/ui/BottomBar';
import { NotificationBubbles } from './components/ui/NotificationBubbles';

export default function App() {
  useMapGen();

  return (
    <>
      <div style={{ display: 'flex', height: '100vh', background: '#0f1923', overflow: 'hidden' }}>
        {/* Map column: phase banner → map → (BottomBar is fixed) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PhaseBanner />
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <HexGrid />
          </div>
          <BottomBar />
        </div>

        {/* Right panel: full height */}
        <SidePanel />
      </div>

      <RoundtableOverlay />
      <NotificationBubbles />
    </>
  );
}
