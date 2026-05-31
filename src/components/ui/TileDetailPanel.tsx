import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { coordKey } from '../../engine/hex';
import { LOYALTY_SCALE, DEFAULT_CONFIG } from '../../config';
import { getAnnexableTileKeys, performAnnex } from '../../hooks/useGame';
import type { TraitVector, OwnedTile } from '../../types';
import { Sprite } from './Sprite';

const TRAITS: { key: keyof TraitVector; pos: string; posEmoji: string; neg: string; negEmoji: string }[] = [
  { key: 'ecology',    pos: 'ecology',    posEmoji: '🌱', neg: 'industry',     negEmoji: '🏭' },
  { key: 'militarism', pos: 'militarism', posEmoji: '⚔️', neg: 'pacifism',     negEmoji: '☮️' },
  { key: 'religion',   pos: 'religion',   posEmoji: '⛪', neg: 'secularism',   negEmoji: '⚛️' },
  { key: 'liberty',    pos: 'liberty',    posEmoji: '🗽', neg: 'collectivism', negEmoji: '🤝' },
  { key: 'progress',   pos: 'progress',   posEmoji: '🚀', neg: 'tradition',    negEmoji: '⛩️' },
];

const divider = <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '4px 0' }} />;

export function TileDetailPanel() {
  const selectedCoord      = useUIStore((state) => state.selectedTileCoord);
  const selectTile         = useUIStore((state) => state.selectTile);
  const draftClickKey      = useUIStore((state) => state.draftClickKey);
  const draftSources       = useUIStore((state) => state.draftSources);
  const setDraftModeActive = useUIStore((state) => state.setDraftModeActive);
  const setDraftClickKey   = useUIStore((state) => state.setDraftClickKey);
  const setDraftSources    = useUIStore((state) => state.setDraftSources);

  const tiles             = useGameStore((state) => state.tiles);
  const players           = useGameStore((state) => state.players);
  const nations           = useGameStore((state) => state.nations);
  const phase             = useGameStore((state) => state.phase);
  const actionsRemaining  = useGameStore((state) => state.actionsRemaining);
  const spentTroopsByTile = useGameStore((state) => state.spentTroopsByTile);

  const [draftMode, setDraftMode] = useState(false);

  // --- drag state ---
  const panelRef      = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffset    = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos]       = useState<{ top: number; left: number } | null>(null);

  // Stable handler refs so document.removeEventListener gets the same function.
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

  const humanPlayer = players.find((p) => p.isHuman);

  useEffect(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragPos(null);
    document.removeEventListener('mousemove', onDocMouseMove.current);
    document.removeEventListener('mouseup', onDocMouseUp.current);
    setDraftMode(false);
    setDraftModeActive(false);
    setDraftSources({});
    setDraftClickKey(null);
  }, [selectedCoord]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onDocMouseMove.current);
      document.removeEventListener('mouseup', onDocMouseUp.current);
    };
  }, []);

  useEffect(() => {
    if (!draftClickKey || !draftMode) return;
    const clickedTile = tiles[draftClickKey];
    if (!clickedTile || clickedTile.state !== 'owned') { setDraftClickKey(null); return; }
    const owned = clickedTile as OwnedTile;
    if (!humanPlayer || owned.ownerId !== humanPlayer.id) { setDraftClickKey(null); return; }
    const alreadyAllocated = draftSources[draftClickKey] ?? 0;
    const spent = spentTroopsByTile[draftClickKey] ?? 0;
    const available = owned.activeTroops - spent - alreadyAllocated;
    const draftedSoFar = Object.values(draftSources).reduce((a, b) => a + b, 0);
    if (available <= 0 || draftedSoFar >= DEFAULT_CONFIG.mobilization.annexTroopCost) {
      setDraftClickKey(null);
      return;
    }
    setDraftSources({ ...draftSources, [draftClickKey]: alreadyAllocated + 1 });
    setDraftClickKey(null);
  }, [draftClickKey]);

  if (!selectedCoord) return null;

  const tile = tiles[coordKey(selectedCoord)];
  if (!tile || tile.state === 'water') return null;

  const tileKey = coordKey(selectedCoord);
  const annexableTileKeys = phase === 'mobilization' ? getAnnexableTileKeys() : new Set<string>();
  const isAnnexable = phase === 'mobilization' && tile.state === 'unclaimed' && annexableTileKeys.has(tileKey);
  const totalAvailableTroops = humanPlayer
    ? Object.values(tiles)
        .filter((t): t is OwnedTile => t.state === 'owned' && (t as OwnedTile).ownerId === humanPlayer.id)
        .reduce((sum, t) => sum + Math.max(0, t.activeTroops - (spentTroopsByTile[coordKey(t.coord)] ?? 0)), 0)
    : 0;
  const annexTroopCost = DEFAULT_CONFIG.mobilization.annexTroopCost;
  const draftedSoFar = Object.values(draftSources).reduce((a, b) => a + b, 0);
  const canAffordAnnex = actionsRemaining >= annexTroopCost && totalAvailableTroops >= annexTroopCost;

  const panelBase: React.CSSProperties = {
    zIndex: 20,
    width: 260,
    background: '#0f1923',
    border: '1px solid #2a3f50',
    padding: 16,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#c0c8d0',
    boxSizing: 'border-box',
  };
  const panelStyle: React.CSSProperties = dragPos
    ? { ...panelBase, position: 'fixed', top: dragPos.top, left: dragPos.left }
    : { ...panelBase, position: 'absolute', top: 12, right: 12 };

  const cv = tile.cultureVector;


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
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tile.state === 'barbarian' && (
            <Sprite size={40} imagePath={'https://thumbs.dreamstime.com/b/barbarian-warrior-fantasy-cartoon-character-video-game-sprite-pixel-art-style-squares-wide-high-barbarian-warrior-419019049.jpg'} name={headerNationName ?? 'Unknown'} />
          )}
          {tile.state === 'owned' && (
            <Sprite size={40} imagePath={headerPlayer?.imagePath ?? null} name={headerPlayer?.name ?? '?'} />
          )}
          <div style={{ fontSize: 16, color: '#e0e8f0' }}>
            {tile.state === 'unclaimed'
              ? tile.name
              : tile.state === 'barbarian'
                ? `${headerNationName ?? 'Unknown'} (barbarian)`
                : (headerNationName ?? 'Unknown')}
          </div>
        </div>
        <button
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

      {tile.state !== 'unclaimed' && <div style={{ marginBottom: 4 }}>🏡 {tile.name}</div>}
      {tile.state === 'owned' && <div>🛡️ {tile.activeTroops}</div>}
      <div>[{tile.coord.q}, {tile.coord.r}]</div>

      {divider}

      {tile.state === 'owned' && (
        <>
          <div>{players.find((p) => p.id === tile.ownerId)?.governmentType ?? '—'}</div>
          <div>😊 {(tile.loyalty / LOYALTY_SCALE).toFixed(1)}</div>
          {divider}
        </>
      )}

      {isAnnexable && !draftMode && (
        <>
          {divider}
          <button
            disabled={!canAffordAnnex}
            onClick={() => { if (canAffordAnnex) { setDraftMode(true); setDraftModeActive(true); } }}
            style={{
              width: '100%', padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
              background: canAffordAnnex ? '#1e2d3a' : '#0f1923',
              color: canAffordAnnex ? '#c0c8d0' : '#3a5060',
              border: `1px solid ${canAffordAnnex ? '#2a3f50' : '#1a2530'}`,
              cursor: canAffordAnnex ? 'pointer' : 'not-allowed',
            }}
          >
            {canAffordAnnex
              ? 'Annex'
              : actionsRemaining < annexTroopCost
               ? 'Annex (insufficient AP)'
                : 'Annex (insufficient troops)'}
          </button>
        </>
      )}

      {isAnnexable && draftMode && (
        <>
          {divider}
          <div style={{ fontSize: 11, color: '#5a7a8a', marginBottom: 4 }}>
            Allocate troops: {draftedSoFar} / {annexTroopCost}
          </div>
          <div style={{ fontSize: 11, color: '#7a9aaa', marginBottom: 8 }}>
            Click highlighted tiles to contribute troops.
          </div>
          {Object.entries(draftSources).map(([key, count]) => (
            <div key={key} style={{ fontSize: 11, color: '#c0c8d0' }}>
              {(tiles[key] as OwnedTile | undefined)?.name ?? key}: {count} troop{count !== 1 ? 's' : ''}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              disabled={draftedSoFar < annexTroopCost}
              onClick={() => {
                if (draftedSoFar >= annexTroopCost) {
                  performAnnex(tileKey, draftSources);
                  setDraftMode(false);
                  setDraftModeActive(false);
                  setDraftSources({});
                  setDraftClickKey(null);
                  selectTile(null);
                }
              }}
              style={{
                flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
                background: draftedSoFar >= annexTroopCost ? '#1e4a2a' : '#0f1923',
                color: draftedSoFar >= annexTroopCost ? '#80cc90' : '#3a5060',
                border: `1px solid ${draftedSoFar >= annexTroopCost ? '#2a6a3a' : '#1a2530'}`,
                cursor: draftedSoFar >= annexTroopCost ? 'pointer' : 'not-allowed',
              }}
            >Confirm</button>
            <button
              onClick={() => {
                setDraftMode(false);
                setDraftModeActive(false);
                setDraftSources({});
                setDraftClickKey(null);
              }}
              style={{
                flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
                background: '#1e2d3a', color: '#c0c8d0', border: '1px solid #2a3f50', cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </>
      )}

      <div style={{ marginTop: 4, marginBottom: 2, color: '#5a7a8a' }}>Traits:</div>
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
    </div>
  );
}
