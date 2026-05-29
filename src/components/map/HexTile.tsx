import { hexCorners } from '../../engine/hex';
import { useUIStore } from '../../store/uiStore';
import type { Tile, PixelCoord, TraitVector } from '../../types';

export const PLAYER_COLORS = ['#4e9e55', '#c93b3b', '#8b4bbf', '#d966a0'];

const TILE_FILL: Record<Tile['state'], string> = {
  water:     '#4a5fa3',
  unclaimed: '#c8b89a',
  barbarian: '#a05c3b',
  owned:     '#7a9e5f', // fallback; playerIndex overrides this
};

const OVERLAY_COLORS: Record<keyof TraitVector, [string, string]> = {
  ecology:       ['#1E3A12', '#66FF00'],
  militarism:    ['#3A0A0A', '#FF1010'],
  religion:      ['#3A2A00', '#FFD700'],
  liberty:       ['#3A1800', '#FF7A00'],
  progress:      ['#1E0A30', '#CC00FF'],
};

const LOYALTY_STOPS: [number, string][] = [
  [0.00, '#CC0000'],
  [0.25, '#CC6600'],
  [0.50, '#CCCC00'],
  [0.75, '#88CC00'],
  [1.00, '#00CC00'],
];

function lerpColor(from: string, to: string, t: number): string {
  const fr = parseInt(from.slice(1, 3), 16);
  const fg = parseInt(from.slice(3, 5), 16);
  const fb = parseInt(from.slice(5, 7), 16);
  const tr = parseInt(to.slice(1, 3), 16);
  const tg = parseInt(to.slice(3, 5), 16);
  const tb = parseInt(to.slice(5, 7), 16);
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function loyaltyToColor(loyalty: number): string {
  const t = Math.max(0, Math.min(1, (loyalty + 10000) / 20000));
  for (let i = 0; i < LOYALTY_STOPS.length - 1; i++) {
    const [t0, c0] = LOYALTY_STOPS[i];
    const [t1, c1] = LOYALTY_STOPS[i + 1];
    if (t <= t1) return lerpColor(c0, c1, (t - t0) / (t1 - t0));
  }
  return LOYALTY_STOPS[LOYALTY_STOPS.length - 1][1];
}

interface HexTileProps {
  tile: Tile;
  center: PixelCoord;
  size: number;
  playerIndex?: number;
  onClick?: () => void;
}

export function HexTile({ tile, center, size, playerIndex, onClick }: HexTileProps) {
  const activeOverlay = useUIStore((state) => state.activeOverlay);

  const points = hexCorners(center, size)
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  let fill: string;
  let fillOpacity = 1;

  if (activeOverlay !== null && activeOverlay.trait === 'loyalty') {
    if (tile.state === 'owned') {
      fill = loyaltyToColor(tile.loyalty);
    } else {
      fill = TILE_FILL[tile.state];
      fillOpacity = 0.35;
    }
  } else if (activeOverlay !== null && tile.state !== 'water') {
    const trait = activeOverlay.trait as keyof TraitVector;
    const { inverted } = activeOverlay;
    const [low, high] = OVERLAY_COLORS[trait];
    const t = inverted ? 1 - tile.cultureVector[trait] : tile.cultureVector[trait];
    fill = lerpColor(low, high, t);
  } else if (tile.state === 'owned' && playerIndex !== undefined) {
    fill = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  } else {
    fill = TILE_FILL[tile.state];
  }

  return (
    <polygon
      points={points}
      fill={fill}
      fillOpacity={fillOpacity}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    />
  );
}
