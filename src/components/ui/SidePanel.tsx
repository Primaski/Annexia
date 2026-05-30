import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { resolveTurn } from '../../hooks/useGame';
import { coordKey } from '../../engine/hex';
import { LOYALTY_SCALE } from '../../config';
import { Sprite } from './Sprite';
import type { TraitVector } from '../../types';

export const SIDE_PANEL_WIDTH = 420;

const TRAITS: { key: keyof TraitVector; pos: string; posEmoji: string; neg: string; negEmoji: string }[] = [
  { key: 'ecology',    pos: 'ecology',     posEmoji: '🌱', neg: 'industry',     negEmoji: '🏭' },
  { key: 'militarism', pos: 'militarism',  posEmoji: '⚔️', neg: 'pacifism',     negEmoji: '☮️' },
  { key: 'religion',   pos: 'religion',    posEmoji: '⛪', neg: 'secularism',   negEmoji: '⚛️' },
  { key: 'liberty',    pos: 'liberty',     posEmoji: '🗽', neg: 'collectivism', negEmoji: '🤝' },
  { key: 'progress',   pos: 'progress',    posEmoji: '🚀', neg: 'tradition',    negEmoji: '⛩️' },
];

const divider = <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '4px 0' }} />;

export function SidePanel() {
  const selectedCoord = useUIStore((state) => state.selectedTileCoord);
  const tiles = useGameStore((state) => state.tiles);
  const currentTurn = useGameStore((state) => state.currentTurn);
  const nations = useGameStore((state) => state.nations);
  const players = useGameStore((state) => state.players);

  const nationById = (id: string | null) => (id ? nations[id] : null);
  const playerById = (id: string) => players.find((p) => p.id === id) ?? null;

  const base: React.CSSProperties = {
    width: SIDE_PANEL_WIDTH,
    flexShrink: 0,
    padding: '20px 16px',
    fontFamily: 'monospace',
    fontSize: 24,
    color: '#c0c8d0',
    borderLeft: '1px solid #1e2d3a',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  if (!selectedCoord) {
    return <div style={{ ...base, fontSize: 24 }}>click a tile</div>;
  }

  const tile = tiles[coordKey(selectedCoord)];
  if (!tile) {
    return <div style={{ ...base, fontSize: 24 }}>tile not found</div>;
  }

  if (tile.state === 'water') {
    return (
      <div style={base}>
        <div>state: water</div>
        <div>[{tile.coord.q}, {tile.coord.r}]</div>
      </div>
    );
  }

  // ── All land tiles ──────────────────────────────────────────────────────────

  let ownerText: string;
  if (tile.state === 'unclaimed') {
    ownerText = 'unclaimed';
  } else if (tile.state === 'barbarian') {
    const nation = nationById(tile.nationId);
    ownerText = `${nation?.name ?? 'Unknown'} (barbarian)`;
  } else {
    const player = playerById(tile.ownerId);
    const nation = nationById(player?.nationId ?? null);
    ownerText = nation?.name ?? 'Unknown';
  }

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
    <div style={base}>
      {tile.state === 'owned' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sprite imagePath={playerById(tile.ownerId)?.imagePath ?? null} name={ownerText} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 35, color: '#e0e8f0' }}>{tile.name}</div>
            <div>owner: {ownerText}</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 35, color: '#e0e8f0' }}>{tile.name}</div>
          <div>owner: {ownerText}</div>
        </>
      )}
      {labelEmojis.length > 0 && <div>{labelEmojis.join('')}</div>}
      <div>[{tile.coord.q}, {tile.coord.r}]</div>

      {divider}

      {tile.state === 'owned' && (
        <>
          <div>{playerById(tile.ownerId)?.governmentType ?? '—'}</div>
          <div>loyalty: {(tile.loyalty / LOYALTY_SCALE).toFixed(1)}</div>
          {divider}
        </>
      )}
      {TRAITS.map(({ key, pos, neg }) => {
        const v = cv[key];
        let name: string;
        let val: string;
        if (v >= 0.75)      { name = pos; val = String(Math.round(v * 100)); }
        else if (v <= 0.25) { name = neg; val = String(Math.round((1 - v) * 100)); }
        else if (v > 0.5)   { name = pos; val = String(Math.round(v * 100)); }
        else                { name = neg; val = String(Math.round((1 - v) * 100)); }
        const text = `${name}: ${val}`;
        const bold = v >= 0.75 || v <= 0.25;
        return (
          <div key={key}>
            {bold ? <strong style={{ color: '#4CAF50' }}>{text}</strong> : text}
          </div>
        );
      })}

      {tile.state === 'barbarian' && (
        <>
          {divider}
          <div>defense: {tile.defense}</div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <button
          onClick={resolveTurn}
          style={{
            width: '100%',
            padding: '8px 0',
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
