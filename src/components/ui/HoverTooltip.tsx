import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { coordKey } from '../../engine/hex';
import type { TraitVector } from '../../types';
import { Sprite } from './Sprite';

const TRAITS: { key: keyof TraitVector; posEmoji: string; negEmoji: string }[] = [
  { key: 'ecology',    posEmoji: '🌱', negEmoji: '🏭' },
  { key: 'militarism', posEmoji: '⚔️', negEmoji: '☮️' },
  { key: 'religion',   posEmoji: '⛪', negEmoji: '⚛️' },
  { key: 'liberty',    posEmoji: '🗽', negEmoji: '🤝' },
  { key: 'progress',   posEmoji: '🚀', negEmoji: '⛩️' },
];

const baseStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#0f1923',
  border: '1px solid #2a3f50',
  padding: '8px 12px',
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#c0c8d0',
  pointerEvents: 'none',
  zIndex: 50,
  minWidth: 140,
};

export function HoverTooltip() {
  const hoveredTileCoord = useUIStore((state) => state.hoveredTileCoord);
  const tooltipPosition  = useUIStore((state) => state.tooltipPosition);
  const tiles   = useGameStore((state) => state.tiles);
  const players = useGameStore((state) => state.players);
  const nations = useGameStore((state) => state.nations);

  if (hoveredTileCoord === null) return null;

  const tile = tiles[coordKey(hoveredTileCoord)];
  if (!tile) return null;

  const style: React.CSSProperties = {
    ...baseStyle,
    left: tooltipPosition.x + 12,
    top: tooltipPosition.y + 12,
  };

  if (tile.state === 'water') {
    return <div style={style}>water</div>;
  }

  const cv = tile.cultureVector;
  const dominantEmojis = TRAITS
    .map(({ key, posEmoji, negEmoji }) => {
      const v = cv[key];
      if (v >= 0.5) return posEmoji;
      if (v <= -0.5) return negEmoji;
      return null;
    })
    .filter((e): e is string => e !== null);

  if (tile.state === 'unclaimed') {
    return (
      <div style={style}>
        <div style={{ fontSize: 14, color: '#e0e8f0', marginBottom: 2 }}>{tile.name}</div>
        <div>unclaimed</div>
        {dominantEmojis.length > 0 && <div>{dominantEmojis.join('')}</div>}
      </div>
    );
  }

  if (tile.state === 'barbarian') {
    const nation = tile.nationId ? nations[tile.nationId] : null;
    const nationName = nation?.name ?? 'Unknown';
    return (
      <div style={style}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sprite size={28} imagePath={'https://thumbs.dreamstime.com/b/barbarian-warrior-fantasy-cartoon-character-video-game-sprite-pixel-art-style-squares-wide-high-barbarian-warrior-419019049.jpg'} name={nationName} />
          <div style={{ fontSize: 16, color: '#e0e8f0' }}>{nationName} (barbarian)</div>
        </div>
        <div style={{ marginBottom: 6 }}>🏡 {tile.name}</div>
        <div>⚔️ {tile.activeTroops}</div>
        {dominantEmojis.length > 0 && <div>{dominantEmojis.join('')}</div>}
      </div>
    );
  }

  // owned
  const player = players.find((p) => p.id === tile.ownerId);
  const nation = player?.nationId ? nations[player.nationId] : null;
  const nationName = nation?.name ?? 'Unknown';
  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Sprite size={28} imagePath={player?.imagePath ?? null} name={player?.name ?? '?'} />
        <div style={{ fontSize: 16, color: '#e0e8f0' }}>{nationName}</div>
      </div>
      <div style={{ marginBottom: 6 }}>🏡 {tile.name}</div>
      {/* TODO: [REDACT in multiplayer] hide troop count for enemy tiles */}
      <div>⚔️ {tile.activeTroops}</div>
      {/* TODO: [REDACT in multiplayer] hide loyalty for enemy tiles unless an intel effect is active */}
      <div>😊 {Math.round(tile.loyalty * 100)}</div>
      {/* TODO: [REDACT in multiplayer] hide culture vector summary for enemy tiles unless an intel effect is active */}
      {dominantEmojis.length > 0 && <div>Traits: {dominantEmojis.join('')}</div>}
    </div>
  );
}
