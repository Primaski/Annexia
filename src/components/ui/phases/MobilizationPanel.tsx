import { useEffect } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { useUIStore } from '../../../store/uiStore';
import { endMobilizationPhase } from '../../../hooks/useGame';
import { coordKey } from '../../../engine/hex';
import { TileDetailContent } from '../TileDetailContent';

export function MobilizationPanel() {
  const actionsRemaining   = useGameStore((state) => state.actionsRemaining);
  const currentTurn        = useGameStore((state) => state.currentTurn);
  const tiles              = useGameStore((state) => state.tiles);
  const selectedCoord      = useUIStore((state) => state.selectedTileCoord);
  const clearPendingAction = useUIStore((state) => state.clearPendingAction);
  const pendingAction      = useUIStore((state) => state.pendingAction);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearPendingAction();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearPendingAction]);

  const pendingDestKey = pendingAction?.destinationKey ?? null;
  const tileKey        = pendingDestKey ?? (selectedCoord ? coordKey(selectedCoord) : null);
  const tile           = tileKey ? tiles[tileKey] : null;
  const showTileDetail = !!(tile && tile.state !== 'water');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 20 }}>

      <div>
        <div style={{ fontSize: 20, color: '#5a7a8a', fontVariant: 'small-caps', letterSpacing: '0.1em' }}>
          Mobilization
        </div>
        <div style={{ fontSize: 24, marginTop: 8 }}>Actions remaining: {actionsRemaining}</div>
        <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '8px 0' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {showTileDetail ? (
          <TileDetailContent tileKey={tileKey!} />
        ) : (
          <div style={{ fontSize: 20, color: '#7a9aaa' }}>
            Right-click and drag to move troops.
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, paddingTop: 8 }}>
        <button
          onClick={endMobilizationPhase}
          style={{
            width: '100%',
            padding: '10px 0',
            fontFamily: 'monospace',
            fontSize: 20,
            background: '#1e2d3a',
            color: '#c0c8d0',
            border: '1px solid #2a3f50',
            cursor: 'pointer',
          }}
        >
          End Turn (Turn {currentTurn})
        </button>
      </div>

    </div>
  );
}
