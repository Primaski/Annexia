import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { coordKey, hexNeighbors, hexCorners } from '../../engine/hex';
import { useMapLayout } from '../../hooks/useMapLayout';
import { SIDE_PANEL_WIDTH } from '../ui/SidePanel';
import { HexTile, PLAYER_COLORS } from './HexTile';
import type { Tile } from '../../types';

const SQ3 = Math.sqrt(3);
const PAD = 8;

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
  const tiles      = useGameStore((state) => state.tiles);
  const players    = useGameStore((state) => state.players);
  const mapCols    = useGameStore((state) => state.config.mapCols);
  const mapRows    = useGameStore((state) => state.config.mapRows);
  const selectTile = useUIStore((state) => state.selectTile);

  const playerIndexById = new Map(players.map((p, i) => [p.id, i]));

  const targetW = window.innerWidth  - SIDE_PANEL_WIDTH - 2 * PAD;
  const targetH = window.innerHeight * 0.96             - 2 * PAD;
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
    <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
      <g transform={`translate(${xOffset},${yOffset})`}>
        {/* Layer 1: tile fills */}
        {tileList.map((tile) => (
          <HexTile
            key={coordKey(tile.coord)}
            tile={tile}
            center={getPixel(tile.coord)}
            size={hexSize}
            playerIndex={tile.state === 'owned' ? playerIndexById.get(tile.ownerId) : undefined}
            onClick={() => selectTile(tile.coord)}
          />
        ))}

        {/* Layer 2: territory border edges */}
        {tileList.flatMap((tile) => {
          if (tile.state !== 'owned' && tile.state !== 'barbarian') return [];

          const center  = getPixel(tile.coord);
          const corners = hexCorners(center, hexSize);
          const neighbors = hexNeighbors(tile.coord);
          const stroke = tile.state === 'owned'
            ? PLAYER_COLORS[(playerIndexById.get(tile.ownerId) ?? 0) % PLAYER_COLORS.length]
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
  );
}
