import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { resolveTurn } from '../../hooks/useGame';
import { coordKey } from '../../engine/hex';
import { LOYALTY_SCALE } from '../../config';
import type { TraitVector } from '../../types';

export const SIDE_PANEL_WIDTH = 320;

const TRAITS: { key: keyof TraitVector; pos: string; posEmoji: string; neg: string; negEmoji: string }[] = [
  { key: 'ecology',    pos: 'ecology',     posEmoji: '🌱', neg: 'industry',     negEmoji: '🏭' },
  { key: 'militarism', pos: 'militarism',  posEmoji: '⚔️', neg: 'pacifism',     negEmoji: '☮️' },
  { key: 'religion',   pos: 'religion',    posEmoji: '⛪', neg: 'secularism',   negEmoji: '⚛️' },
  { key: 'liberty',    pos: 'liberty',     posEmoji: '🗽', neg: 'collectivism', negEmoji: '🤝' },
  { key: 'progress',   pos: 'progress',    posEmoji: '🚀', neg: 'tradition',    negEmoji: '⛩️' },
];

export function SidePanel() {
  const selectedCoord = useUIStore((state) => state.selectedTileCoord);
  const tiles = useGameStore((state) => state.tiles);
  const currentTurn = useGameStore((state) => state.currentTurn);
  const updatePlayer = useGameStore((state) => state.updatePlayer);

  const base: React.CSSProperties = {
    width: SIDE_PANEL_WIDTH,
    flexShrink: 0,
    padding: '20px 16px',
    fontFamily: 'monospace',
    fontSize: 24,
    color: '#c0c8d0',
    borderLeft: '1px solid #1e2d3a',
    overflowY: 'auto',
  };

  if (!selectedCoord) {
    return <div style={base}>click a tile</div>;
  }

  const tile = tiles[coordKey(selectedCoord)];
  if (!tile) {
    return <div style={base}>tile not found</div>;
  }

  return (
    <div style={{ ...base, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>state: {tile.state}</div>
      <div>[{tile.coord.q}, {tile.coord.r}]</div>

      {tile.state === 'owned' && (() => {
        const loyaltyVal = tile.loyalty / LOYALTY_SCALE;
        return <div>loyalty: {loyaltyVal >= 0 ? '+' : ''}{loyaltyVal.toFixed(1)}</div>;
      })()}

      {tile.state !== 'water' && (() => {
        const cv = tile.cultureVector;

        const labelEmojis = TRAITS
          .map(({ key, posEmoji, negEmoji }) => {
            const v = cv[key];
            if (v >= 0.75) return posEmoji;
            if (v <= 0.25) return negEmoji;
            return null;
          })
          .filter((e): e is string => e !== null);

        return (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '4px 0' }} />
            {labelEmojis.length > 0 && <div>{labelEmojis.join('')}</div>}
            {TRAITS.map(({ key, pos, neg }) => {
              const v = cv[key];
              let name: string;
              let val: string;
              if (v >= 0.75)      { name = pos; val = String(Math.round(v * 100)); }
              else if (v <= 0.25) { name = neg; val = String(Math.round((1 - v) * 100)); }
              else                { name = pos; val = String(Math.round(v * 100)); }
              const text = `${name}: ${val}`;
              const bold = v >= 0.75 || v <= 0.25;
              return <div key={key}>{bold ? <strong style={{ color: '#4CAF50' }}>{text}</strong> : text}</div>;
            })}
          </>
        );
      })()}

      {tile.state === 'barbarian' && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '4px 0' }} />
          <div>defense: {tile.defense}</div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <button
          onClick={resolveTurn}
          style={{ width: '100%', padding: '8px 0', fontFamily: 'monospace', fontSize: 13, background: '#1e2d3a', color: '#c0c8d0', border: '1px solid #2a3f50', cursor: 'pointer' }}
        >
          End Turn (Turn {currentTurn})
        </button>
      </div>

      <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: '#3a5a6a', letterSpacing: '0.1em' }}>DEBUG</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => updatePlayer('player_1', { alignmentVector: { ecology: 0, militarism: 0, religion: 0, liberty: 0, progress: 0 } })}
            style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 11, background: '#0f1923', color: '#3a5a6a', border: '1px solid #1e2d3a', cursor: 'pointer' }}
          >Polar A</button>
          <button
            onClick={() => updatePlayer('player_1', { alignmentVector: { ecology: 1, militarism: 1, religion: 1, liberty: 1, progress: 1 } })}
            style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 11, background: '#0f1923', color: '#3a5a6a', border: '1px solid #1e2d3a', cursor: 'pointer' }}
          >Polar B</button>
          <button
            onClick={() => updatePlayer('player_1', { alignmentVector: { ecology: 0.5, militarism: 0.5, religion: 0.5, liberty: 0.5, progress: 0.5 } })}
            style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 11, background: '#0f1923', color: '#3a5a6a', border: '1px solid #1e2d3a', cursor: 'pointer' }}
          >Neutral</button>
        </div>
      </div>
    </div>
  );
}
