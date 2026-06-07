import { hexCorners, hexNeighbors, coordKey } from '../../engine/hex';
import { useUIStore } from '../../store/uiStore';
import type { Tile, PixelCoord, TraitVector, Policy, TerrainType, LandTile } from '../../types';
import { DEFAULT_CONFIG } from '../../config';
import { PLAYER_COLORS } from './playerColors';

const TERRAIN_TINT: Record<TerrainType, string> = {
  plains:  '#8aaa6a',
  forest:  '#5a7a52',
  hills:   '#97976d',
  desert:  '#ddc1a5',
  coast:   '#6a8a82',
};

const TILE_FILL: Record<Tile['state'], string> = {
  water:     '#687cbe',
  unclaimed: '#c8b89a',
  barbarian: '#a05c3b',
  owned:     '#7a9e5f', // fallback; playerIndex overrides this
};

const OVERLAY_COLORS: Record<keyof TraitVector, [string, string]> = {
  ecology:       ['#1E3A12', '#66FF00'],
  militarism:    ['#3A0A0A', '#FF1010'],
  religion:      ['#3A2A00', '#FFD700'],
  individualism: ['#3A1800', '#FF7A00'],
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
  const t = Math.max(0, Math.min(1, (loyalty + 1) / 2));
  for (let i = 0; i < LOYALTY_STOPS.length - 1; i++) {
    const [t0, c0] = LOYALTY_STOPS[i];
    const [t1, c1] = LOYALTY_STOPS[i + 1];
    if (t <= t1) return lerpColor(c0, c1, (t - t0) / (t1 - t0));
  }
  return LOYALTY_STOPS[LOYALTY_STOPS.length - 1][1];
}

function darkenColor(hex: string, factor: number): string {
  const clamp = (n: number) => Math.min(255, Math.max(0, n));
  const r = clamp(Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = clamp(Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = clamp(Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function blendedTerrainTint(tile: Tile, tiles: Record<string, Tile> | undefined): string {
  if (tile.state === 'water') return TILE_FILL['water'];
  const landTile = tile as LandTile;
  const ownTint = TERRAIN_TINT[landTile.terrainType];
  if (!tiles) return ownTint;

  const neighbors = hexNeighbors(landTile.coord);
  let totalWeight = 2;
  let r = parseInt(ownTint.slice(1, 3), 16) * 2;
  let g = parseInt(ownTint.slice(3, 5), 16) * 2;
  let b = parseInt(ownTint.slice(5, 7), 16) * 2;

  for (const neighborCoord of neighbors) {
    const neighbor = tiles[coordKey(neighborCoord)];
    if (!neighbor || neighbor.state === 'water') continue;
    const neighborTint = TERRAIN_TINT[(neighbor as LandTile).terrainType];
    r += parseInt(neighborTint.slice(1, 3), 16);
    g += parseInt(neighborTint.slice(3, 5), 16);
    b += parseInt(neighborTint.slice(5, 7), 16);
    totalWeight += 1;
  }

  const fr = Math.round(r / totalWeight);
  const fg = Math.round(g / totalWeight);
  const fb = Math.round(b / totalWeight);
  return `#${fr.toString(16).padStart(2, '0')}${fg.toString(16).padStart(2, '0')}${fb.toString(16).padStart(2, '0')}`;
}

interface HexTileProps {
  tile: Tile;
  center: PixelCoord;
  size: number;
  playerIndex?: number;
  isDraftSource?: boolean;
  isAnnexTarget?: boolean;
  activePolicy?: Policy;
  humanPlayerId?: string;
  tiles?: Record<string, Tile>;
  draftCount?: number;
  lockedArrivals?: number;
  onClick?: () => void;
}

export function HexTile({ tile, center, size, playerIndex, isDraftSource, isAnnexTarget, activePolicy, humanPlayerId, tiles, draftCount, lockedArrivals, onClick }: HexTileProps) {
  const activeOverlay      = useUIStore((state) => state.activeOverlay);
  const policyHoverChoice  = useUIStore((state) => state.policyHoverChoice);

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
    const raw = (tile.cultureVector[trait] + 1) / 2;
    const t = inverted ? 1 - raw : raw;
    fill = lerpColor(low, high, t);
  } else if (tile.state === 'owned' && playerIndex !== undefined) {
    fill = lerpColor(PLAYER_COLORS[playerIndex % PLAYER_COLORS.length], blendedTerrainTint(tile, tiles), 0.35);
  } else if (tile.state !== 'water') {
    fill = blendedTerrainTint(tile, tiles);
  } else {
    fill = TILE_FILL['water'];
  }

  if (isDraftSource) { fill = '#5a9ecc'; }
  if (tile.state === 'owned' && tile.troops > 0) { fill = darkenColor(fill, 0.85); }
  if (activeOverlay === null && tile.state === 'barbarian') {
    const base = blendedTerrainTint(tile, tiles);
    fill = lerpColor(base, '#e7b197', 0.80);
    if (tile.troops >= 1) fill = lerpColor(fill, '#000000', 0.15);
  }

  let loyaltyOverlayColor: string | null = null;

  if (
    activePolicy !== undefined &&
    policyHoverChoice !== null &&
    tile.state === 'owned' &&
    humanPlayerId !== undefined &&
    tile.ownerId === humanPlayerId
  ) {
    const isDecline = policyHoverChoice === 1;
    const declineMod = activePolicy.declineModifier ?? 1.0;
    let delta = 0;
    for (const [trait, shift] of Object.entries(activePolicy.alignmentShift) as Array<[keyof TraitVector, number]>) {
      const appliedShift = isDecline ? -shift * declineMod : shift;
      delta += appliedShift * tile.cultureVector[trait as keyof TraitVector];
    }
    delta *= DEFAULT_CONFIG.policy.loyaltyModifierScale;

    if (delta > 0.02) {
      loyaltyOverlayColor = '#FFD700';
    } else if (delta < -0.02) {
      loyaltyOverlayColor = '#441500';
    }
  }

  if (!document.getElementById('hex-pulse-styles')) {
    const el = document.createElement('style');
    el.id = 'hex-pulse-styles';
    el.textContent =
      '@keyframes annexPulse { 0% { opacity: 0 } 50% { opacity: 0.5 } 100% { opacity: 0 } }' +
      '@keyframes loyaltyPulse { 0% { opacity: 0 } 50% { opacity: 0.45 } 100% { opacity: 0 } }' +
      '@keyframes borderPulse { 0% { stroke-opacity: 0.15 } 50% { stroke-opacity: 0.65 } 100% { stroke-opacity: 0.15 } }';
    document.head.appendChild(el);
  }

  const terrainFilter = tile.state !== 'water'
    ? `url(#terrain-${tile.terrainType})`
    : undefined;

  return (
    <>
      <polygon
        points={points}
        fill={fill}
        fillOpacity={fillOpacity}
        filter={terrainFilter}
        onClick={onClick}
        style={onClick ? { cursor: 'pointer' } : undefined}
      />
      {isAnnexTarget && (
        <polygon
          points={points}
          fill={PLAYER_COLORS[playerIndex ?? 0]}
          style={{ animation: 'annexPulse 1.2s ease-in-out infinite', pointerEvents: 'none' }}
        />
      )}
      {loyaltyOverlayColor !== null && (
        <polygon
          points={points}
          fill={loyaltyOverlayColor}
          style={{ animation: 'loyaltyPulse 1.0s ease-in-out infinite', pointerEvents: 'none' }}
        />
      )}
      {draftCount !== undefined && draftCount !== 0 && (
        <text
          x={center.x.toFixed(2)}
          y={center.y.toFixed(2)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={draftCount > 0 ? '#80cc90' : '#cc8844'}
          fontSize={size * 0.7}
          fontFamily="monospace"
          fontWeight="bold"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {draftCount > 0 ? `+${draftCount}` : `${draftCount}`}
        </text>
      )}
      {draftCount === undefined && tile.state !== 'water' && (() => {
        const troopCount = (tile.state === 'owned' || tile.state === 'barbarian') ? tile.troops : 0;
        if (troopCount <= 0) return null;
        const locked = lockedArrivals ?? 0;
        const free = troopCount - locked;
        if (locked > 0) {
          return (
            <text
              x={center.x.toFixed(2)}
              y={center.y.toFixed(2)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="monospace"
              fontWeight="bold"
              fontSize={size * 0.55}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              <tspan fill="#e0e8f0">{free}</tspan>
              <tspan fill="#8ab0c0">|</tspan>
              <tspan fill="#8ab0c0">{troopCount}</tspan>
            </text>
          );
        }
        return (
          <text
            x={center.x.toFixed(2)}
            y={center.y.toFixed(2)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#e0e8f0"
            fontSize={size * 0.7}
            fontFamily="monospace"
            fontWeight="bold"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {troopCount}
          </text>
        );
      })()}
    </>
  );
}
