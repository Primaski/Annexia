import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { coordKey } from '../../engine/hex';
import { Sprite } from './Sprite';
import { TileDetailContent } from './TileDetailContent';

export function TileDetailPanel() {
  const selectedCoord = useUIStore((state) => state.selectedTileCoord);
  const selectTile    = useUIStore((state) => state.selectTile);

  const tiles   = useGameStore((state) => state.tiles);
  const players = useGameStore((state) => state.players);
  const nations = useGameStore((state) => state.nations);
  const phase   = useGameStore((state) => state.phase);

  // --- drag state ---
  const panelRef      = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffset    = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos]       = useState<{ top: number; left: number } | null>(null);

  const onDocMouseMove = useRef((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    setDragPos({ top: e.clientY - dragOffset.current.y, left: e.clientX - dragOffset.current.x });
  });
  const onDocMouseUp = useRef(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.removeEventListener('mousemove', onDocMouseMove.current);
    document.removeEventListener('mouseup', onDocMouseUp.current);
  });

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    isDraggingRef.current = true;
    setIsDragging(true);
    setDragPos({ top: rect.top, left: rect.left });
    document.addEventListener('mousemove', onDocMouseMove.current);
    document.addEventListener('mouseup', onDocMouseUp.current);
  };
  // --- end drag state ---

  useEffect(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragPos(null);
    document.removeEventListener('mousemove', onDocMouseMove.current);
    document.removeEventListener('mouseup', onDocMouseUp.current);
  }, [selectedCoord]);

  useEffect(() => {
    const moveHandler = onDocMouseMove.current;
    const upHandler = onDocMouseUp.current;
    return () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
  }, []);

  if (!selectedCoord) return null;

  const tileKey = coordKey(selectedCoord);
  const tile = tiles[tileKey];
  if (!tile || tile.state === 'water') return null;

  if (phase === 'mobilization') return null;

  const panelBase: CSSProperties = {
    zIndex: 20,
    width: 260,
    background: 'rgba(15, 25, 35, 0.85)',
    border: '1px solid #2a3f50',
    padding: 16,
    fontFamily: 'monospace',
    fontSize: 18,
    color: '#c0c8d0',
    boxSizing: 'border-box',
  };
  const panelStyle: CSSProperties = dragPos
    ? { ...panelBase, position: 'fixed', top: dragPos.top, left: dragPos.left }
    : { ...panelBase, position: 'absolute', top: 12, right: 12 };

  const headerPlayer = tile.state === 'owned' ? players.find((p) => p.id === tile.ownerId) : null;
  const headerNationName = tile.state === 'barbarian'
    ? (tile.nationId ? nations[tile.nationId]?.name ?? 'Unknown' : 'Unknown')
    : tile.state === 'owned'
      ? (headerPlayer?.nationId ? nations[headerPlayer.nationId]?.name ?? 'Unknown' : 'Unknown')
      : null;

  return (
    <div ref={panelRef} style={panelStyle}>
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tile.state === 'barbarian' && (
            <Sprite size={72} zoom={1.2} imagePath={'https://thumbs.dreamstime.com/b/barbarian-warrior-fantasy-cartoon-character-video-game-sprite-pixel-art-style-squares-wide-high-barbarian-warrior-419019049.jpg'} name={headerNationName ?? 'Unknown'} />
          )}
          {tile.state === 'owned' && (
            <Sprite size={72} zoom={1.2} imagePath={headerPlayer?.imagePath ?? null} name={headerPlayer?.name ?? '?'} />
          )}
          <div>
            <div style={{ fontSize: 20, color: '#e0e8f0' }}>
              {tile.state === 'unclaimed'
                ? tile.name
                : tile.state === 'barbarian'
                  ? `${headerNationName ?? 'Unknown'} (barbarian)`
                  : (headerNationName ?? 'Unknown')}
            </div>
            <div style={{ fontSize: 14, color: '#3a5a6a', marginTop: 2 }}>
              [{tile.coord.q}, {tile.coord.r}]
            </div>
          </div>
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => selectTile(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#5a7a8a',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <TileDetailContent tileKey={tileKey} />
    </div>
  );
}
