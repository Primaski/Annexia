import { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { coordKey, hexNeighbors, hexCorners } from '../../engine/hex';
import { useMapLayout } from '../../hooks/useMapLayout';
import { HexTile } from './HexTile';
import { PLAYER_COLORS } from './playerColors';
import type { Tile, OwnedTile } from '../../types';

const SQ3 = Math.sqrt(3);
const PAD = 8;

function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  const clamp = (n: number) => Math.min(255, Math.max(0, n));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

// Maps each of the 6 neighbor directions (matching AXIAL_DIRECTIONS order in hex.ts)
// to the pair of hexCorners indices that form that edge.
const DIRECTION_CORNERS: [number, number][] = [
  [1, 2], // E
  [0, 1], // NE
  [5, 0], // NW
  [4, 5], // W
  [3, 4], // SW
  [2, 3], // SE
];

export function HexGrid() {
  const tiles             = useGameStore((state) => state.tiles);
  const players           = useGameStore((state) => state.players);
  const phase             = useGameStore((state) => state.phase);
  const mapCols           = useGameStore((state) => state.config.mapCols);
  const mapRows           = useGameStore((state) => state.config.mapRows);
  const spentTroopsByTile = useGameStore((state) => state.spentTroopsByTile);
  const selectTile         = useUIStore((state) => state.selectTile);
  const setHoveredTile     = useUIStore((state) => state.setHoveredTile);
  const setTooltipPosition = useUIStore((state) => state.setTooltipPosition);
  const draftModeActive    = useUIStore((state) => state.draftModeActive);
  const draftSources       = useUIStore((state) => state.draftSources);
  const setDraftClickKey   = useUIStore((state) => state.setDraftClickKey);
  const selectedTileCoord  = useUIStore((state) => state.selectedTileCoord);
  const humanPlayer = players.find((p) => p.isHuman);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const playerIndexById = new Map(players.map((p, i) => [p.id, i]));

  const targetW = containerSize.width  - 2 * PAD;
  const targetH = containerSize.height - 2 * PAD;
  const sizeFromW = targetW / (SQ3 * (mapCols + 0.5));
  const sizeFromH = targetH / (1.5 * mapRows + 0.5);
  const hexSize = Math.max(1, Math.floor(Math.min(sizeFromW, sizeFromH)));

  const getPixel = useMapLayout(hexSize);

  const xOffset   = (SQ3 / 2) * hexSize + PAD;
  const yOffset   = hexSize + PAD;
  const svgWidth  = Math.ceil(SQ3 * hexSize * (mapCols + 0.5)) + 2 * PAD;
  const svgHeight = Math.ceil(hexSize * (1.5 * mapRows + 0.5)) + 2 * PAD;

  const tileList = Object.values(tiles);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
    <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
      <g transform={`translate(${xOffset},${yOffset})`}>
        {/* Layer 1: tile fills */}
        {tileList.map((tile) => {
          const tKey = coordKey(tile.coord);
          const owned = tile.state === 'owned' ? tile as OwnedTile : null;
          const isDraftSource = draftModeActive && owned !== null && owned.ownerId === humanPlayer?.id &&
            (owned.activeTroops - (spentTroopsByTile[tKey] ?? 0) - (draftSources[tKey] ?? 0)) > 0;
          const isAnnexTarget = phase === 'mobilization' && draftModeActive &&
            selectedTileCoord !== null && tKey === coordKey(selectedTileCoord);
          return (
            <g
              key={tKey}
              onMouseEnter={(e) => { setHoveredTile(tile.coord); setTooltipPosition({ x: e.clientX, y: e.clientY }); }}
              onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredTile(null)}
            >
              <HexTile
                tile={tile}
                center={getPixel(tile.coord)}
                size={hexSize}
                playerIndex={tile.state === 'owned' ? playerIndexById.get(tile.ownerId) : undefined}
                isDraftSource={isDraftSource}
                isAnnexTarget={isAnnexTarget}
                onClick={() => {
                  if (draftModeActive) {
                    setDraftClickKey(tKey);
                  } else {
                    selectTile(tile.coord);
                  }
                }}
              />
            </g>
          );
        })}

        {/* Layer 2: territory border edges */}
        {tileList.flatMap((tile) => {
          if (tile.state !== 'owned' && tile.state !== 'barbarian') return [];

          const center  = getPixel(tile.coord);
          const corners = hexCorners(center, hexSize);
          const neighbors = hexNeighbors(tile.coord);
          const stroke = tile.state === 'owned'
            ? darkenHex(PLAYER_COLORS[(playerIndexById.get(tile.ownerId) ?? 0) % PLAYER_COLORS.length], 0.5)
            : '#6B3A2A';

          return DIRECTION_CORNERS.flatMap(([c1, c2], k) => {
            const neighbor = tiles[coordKey(neighbors[k])] as Tile | undefined;

            let draw = false;
            if (tile.state === 'owned') {
              draw = !neighbor || neighbor.state !== 'owned' || neighbor.ownerId !== tile.ownerId;
            } else {
              draw = !neighbor || neighbor.state !== 'barbarian';
            }

            if (!draw) return [];

            return (
              <line
                key={`${coordKey(tile.coord)}-${k}`}
                x1={corners[c1].x.toFixed(2)}
                y1={corners[c1].y.toFixed(2)}
                x2={corners[c2].x.toFixed(2)}
                y2={corners[c2].y.toFixed(2)}
                stroke={stroke}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          });
        })}
      </g>
    </svg>
    </div>
  );
}
