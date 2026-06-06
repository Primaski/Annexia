import { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { coordKey, hexNeighbors, hexCorners } from '../../engine/hex';
import { useMapLayout } from '../../hooks/useMapLayout';
import { HexTile } from './HexTile';
import { PLAYER_COLORS } from './playerColors';
import { getAvailableActionsForTile } from '../../hooks/useGame';
import type { Tile, OwnedTile, Policy } from '../../types';

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
  const tiles             = useGameStore((state) => state.tiles);
  const players           = useGameStore((state) => state.players);
  const phase             = useGameStore((state) => state.phase);
  const activePolicyCards      = useGameStore((state) => state.activePolicyCards);
  const currentPolicyCardIndex = useGameStore((state) => state.currentPolicyCardIndex);
  const mapCols           = useGameStore((state) => state.config.mapCols);
  const mapRows           = useGameStore((state) => state.config.mapRows);
  const spentTroopsByTile = useGameStore((state) => state.spentTroopsByTile);
  const selectTile            = useUIStore((state) => state.selectTile);
  const setHoveredTile        = useUIStore((state) => state.setHoveredTile);
  const setTooltipPosition    = useUIStore((state) => state.setTooltipPosition);
  const draftModeActive       = useUIStore((state) => state.draftModeActive);
  const invadeModeActive      = useUIStore((state) => state.invadeModeActive);
  const draftSources          = useUIStore((state) => state.draftSources);
  const setDraftClickKey      = useUIStore((state) => state.setDraftClickKey);
  const selectedTileCoord     = useUIStore((state) => state.selectedTileCoord);
  const viewingPlayerId       = useUIStore((state) => state.viewingPlayerId);
  const pushToast             = useUIStore((state) => state.pushToast);
  const setPendingRightClickAction = useUIStore((state) => state.setPendingRightClickAction);
  const setPendingActionFlash = useUIStore((state) => state.setPendingActionFlash);
  const actionsRemaining      = useGameStore((state) => state.actionsRemaining);
  const relocatedTroops       = useGameStore((state) => state.relocatedTroops);
  const humanPlayer = players.find((p) => p.id === viewingPlayerId);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

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

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    if (Object.keys(tiles).length > 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [Object.keys(tiles).length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const activePolicy: Policy | undefined =
    phase === 'policy' ? activePolicyCards[currentPolicyCardIndex] : undefined;

  const tileList = Object.values(tiles);

  function clampPan(x: number, y: number, z: number): { x: number; y: number } {
    const scaledW = svgWidth * z;
    const scaledH = svgHeight * z;
    const maxX = Math.max(0, (scaledW - containerSize.width)  / 2);
    const maxY = Math.max(0, (scaledH - containerSize.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
    <div
      ref={mapRef}
      style={{
        width: svgWidth,
        height: svgHeight,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        cursor: isPanning.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onMouseDown={(e) => {
        isPanning.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseMove={(e) => {
        if (!isPanning.current) return;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setPan((p) => clampPan(p.x + dx, p.y + dy, zoom));
      }}
      onMouseUp={() => { isPanning.current = false; }}
      onMouseLeave={() => { isPanning.current = false; }}
      onWheel={(e) => {
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        setZoom((z) => {
          const next = Math.max(0.4, Math.min(3, z * factor));
          setPan((p) => clampPan(p.x, p.y, next));
          return next;
        });
      }}
    >
    <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
      <defs>
        <filter id="terrain-plains" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-forest" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="4" seed="2" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-hills" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.55" numOctaves="3" seed="3" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-desert" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="2" seed="4" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-coast" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="5" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>
      <g transform={`translate(${xOffset},${yOffset})`}>
        {/* Layer 1: tile fills */}
        {tileList.map((tile) => {
          const tKey = coordKey(tile.coord);
          const owned = tile.state === 'owned' ? tile as OwnedTile : null;
          const adjacentToSelected = invadeModeActive && selectedTileCoord !== null
            ? new Set(hexNeighbors(selectedTileCoord).map(coordKey)).has(tKey)
            : true;
          const isDraftSource = draftModeActive && owned !== null && owned.ownerId === humanPlayer?.id &&
            adjacentToSelected &&
            (owned.activeTroops - (spentTroopsByTile[tKey] ?? 0) - (draftSources[tKey] ?? 0)) > 0;
          const isAnnexTarget = phase === 'mobilization' && draftModeActive &&
            selectedTileCoord !== null && tKey === coordKey(selectedTileCoord);
          return (
            <g
              key={tKey}
              onMouseEnter={(e) => { setHoveredTile(tile.coord); setTooltipPosition({ x: e.clientX, y: e.clientY }); }}
              onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredTile(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (phase !== 'mobilization') return;
                if (!viewingPlayerId) return;

                const actions = getAvailableActionsForTile(
                  tKey,
                  tiles,
                  viewingPlayerId,
                  actionsRemaining,
                  spentTroopsByTile,
                  relocatedTroops,
                  mapCols,
                  mapRows,
                );

                if (actions.length === 0) return;

                const action = actions[0];

                selectTile(tile.coord);

                if (!action.canAfford) {
                  const reasonLabel: Record<string, string> = {
                    no_ap:               'Not enough AP',
                    no_troops:           'No troops available',
                    no_adjacent_troops:  'No adjacent troops',
                    no_connected_troops: 'No connected troops',
                  };
                  pushToast({
                    message: reasonLabel[action.blockedReason ?? 'no_ap'],
                    x: e.clientX,
                    y: e.clientY,
                    variant: 'error',
                  });
                  setPendingActionFlash(true);
                  return;
                }

                pushToast({
                  message: action.type.toUpperCase(),
                  x: e.clientX,
                  y: e.clientY,
                  variant: 'success',
                });

                setPendingRightClickAction(action.type);
              }}
            >
              <HexTile
                tile={tile}
                center={getPixel(tile.coord)}
                size={hexSize}
                playerIndex={tile.state === 'owned' ? playerIndexById.get(tile.ownerId) : undefined}
                tiles={tiles}
                isDraftSource={isDraftSource}
                isAnnexTarget={isAnnexTarget}
                activePolicy={activePolicy}
                humanPlayerId={humanPlayer?.id}
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
          const tKey = coordKey(tile.coord);

          return DIRECTION_CORNERS.flatMap(([c1, c2], k) => {
            const neighbor = tiles[coordKey(neighbors[k])] as Tile | undefined;

            let draw = false;
            if (tile.state === 'owned') {
              draw = !neighbor || neighbor.state !== 'owned' || neighbor.ownerId !== tile.ownerId;
            } else {
              draw = !neighbor || neighbor.state !== 'barbarian';
            }

            if (!draw) return [];

            const x1 = corners[c1].x.toFixed(2);
            const y1 = corners[c1].y.toFixed(2);
            const x2 = corners[c2].x.toFixed(2);
            const y2 = corners[c2].y.toFixed(2);

            if (tile.state === 'barbarian') {
              return [
                <line key={`${tKey}-${k}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke='#6B3A2A' strokeWidth={2} strokeLinecap="round"
                />
              ];
            }

            const playerColor = PLAYER_COLORS[(playerIndexById.get(tile.ownerId) ?? 0) % PLAYER_COLORS.length];
            return [
              <line key={`${tKey}-${k}-base`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={playerColor} strokeWidth={2.5} strokeOpacity={0.7} strokeLinecap="round"
              />,
              <line key={`${tKey}-${k}-pulse`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={playerColor} strokeWidth={3.5} strokeLinecap="round"
                style={{ animation: 'borderPulse 2.4s ease-in-out infinite', pointerEvents: 'none' }}
              />,
            ];
          });
        })}
      </g>
    </svg>
    </div>
    </div>
  );
}
