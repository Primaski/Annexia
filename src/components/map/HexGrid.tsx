import { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { coordKey, hexNeighbors, hexCorners } from '../../engine/hex';
import { useMapLayout } from '../../hooks/useMapLayout';
import { HexTile } from './HexTile';
import { PLAYER_COLORS } from './playerColors';
import { performAnnex, performFortify, performInvade, getAnnexableTileKeys, getLockedArrivalsByTile } from '../../hooks/useGame';
import { DEFAULT_CONFIG } from '../../config';
import type { Tile, Policy } from '../../types';

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
  const tiles                  = useGameStore((state) => state.tiles);
  const players                = useGameStore((state) => state.players);
  const phase                  = useGameStore((state) => state.phase);
  const activePolicyCards      = useGameStore((state) => state.activePolicyCards);
  const currentPolicyCardIndex = useGameStore((state) => state.currentPolicyCardIndex);
  const mapCols                = useGameStore((state) => state.config.mapCols);
  const mapRows                = useGameStore((state) => state.config.mapRows);
  const selectTile             = useUIStore((state) => state.selectTile);
  const setHoveredTile         = useUIStore((state) => state.setHoveredTile);
  const setTooltipPosition     = useUIStore((state) => state.setTooltipPosition);
  const hoveredTileCoord       = useUIStore((state) => state.hoveredTileCoord);
  const viewingPlayerId        = useUIStore((state) => state.viewingPlayerId);
  const pushToast              = useUIStore((state) => state.pushToast);
  const pendingAction          = useUIStore((state) => state.pendingAction);
  const setPendingAction       = useUIStore((state) => state.setPendingAction);
  const addPendingSource       = useUIStore((state) => state.addPendingSource);
  const adjustPendingSource    = useUIStore((state) => state.adjustPendingSource);
  const clearPendingAction     = useUIStore((state) => state.clearPendingAction);
  const actionsRemaining       = useGameStore((state) => state.actionsRemaining);
  const relocatedTroops        = useGameStore((state) => state.relocatedTroops);
  const humanPlayer = players.find((p) => p.id === viewingPlayerId);
  console.log('[DEBUG] HexGrid render — pendingAction:', pendingAction);

  function getAvailable(tileKey: string): number {
    const t = tiles[tileKey];
    if (!t || t.state !== 'owned') return 0;
    const lockedArrivals = getLockedArrivalsByTile(relocatedTroops);
    const alreadyAllocated = pendingAction?.sources[tileKey] ?? 0;
    return Math.max(0, t.troops - (lockedArrivals[tileKey] ?? 0) - alreadyAllocated);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragFromKey = useRef<string | null>(null);
  const isDraggingRight = useRef(false);
  const lastSourceKey = useRef<string | null>(null);
  const initialCenteredRef = useRef(false);

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
    if (initialCenteredRef.current) return;
    if (Object.keys(tiles).length === 0) return;
    if (containerSize.width === 800 && containerSize.height === 600) return;

    initialCenteredRef.current = true;

    const humanOwnedTiles = Object.values(tiles).filter(
      (t) => t.state === 'owned' && t.ownerId === viewingPlayerId
    );

    if (humanOwnedTiles.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Recompute layout values fresh inside the effect to avoid stale closure
    const tW = containerSize.width  - 2 * PAD;
    const tH = containerSize.height - 2 * PAD;
    const sFromW = tW / (SQ3 * (mapCols + 0.5));
    const sFromH = tH / (1.5 * mapRows + 0.5);
    const hSize = Math.max(1, Math.floor(Math.min(sFromW, sFromH)));
    const xOff = (SQ3 / 2) * hSize + PAD;
    const yOff = hSize + PAD;
    const svgW = Math.ceil(SQ3 * hSize * (mapCols + 0.5)) + 2 * PAD;
    const svgH = Math.ceil(hSize * (1.5 * mapRows + 0.5)) + 2 * PAD;

    // axial → pixel for pointy-top hex
    let sumX = 0;
    let sumY = 0;
    for (const t of humanOwnedTiles) {
      const { q, r } = t.coord;
      const px = SQ3 * hSize * (q + r / 2) + xOff;
      const py = (3 / 2) * hSize * r + yOff;
      sumX += px;
      sumY += py;
    }
    const cx = sumX / humanOwnedTiles.length;
    const cy = sumY / humanOwnedTiles.length;

    const targetZoom = 6;

    // With transformOrigin: center center:
    // screen pos of SVG point (cx, cy) = containerCenter + pan + (svgPoint - svgCenter) * zoom
    // Setting screen pos = container center → pan = -(cx - svgW/2) * zoom, -(cy - svgH/2) * zoom
    const rawPanX = -(cx - svgW / 2) * targetZoom;
    const rawPanY = -(cy - svgH / 2) * targetZoom;

    // clampPan inline since the outer clampPan closes over stale svgWidth/svgHeight
    const scaledW = svgW * targetZoom;
    const scaledH = svgH * targetZoom;
    const maxX = Math.max(0, (scaledW - containerSize.width)  / 2);
    const maxY = Math.max(0, (scaledH - containerSize.height) / 2);
    const clampedX = Math.max(-maxX, Math.min(maxX, rawPanX));
    const clampedY = Math.max(-maxY, Math.min(maxY, rawPanY));

    setZoom(targetZoom);
    setPan({ x: clampedX, y: clampedY });
  }, [Object.keys(tiles).length, containerSize, viewingPlayerId, mapCols, mapRows]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const lockedArrivalsByTile = getLockedArrivalsByTile(relocatedTroops);

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
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button === 2) {
          // Right button: start a drag gesture (mobilization only)
          if (phase === 'mobilization' && hoveredTileCoord !== null) {
            dragFromKey.current = coordKey(hoveredTileCoord);
          }
          isDraggingRight.current = true;
          return;
        }
        // Left button: pan as before
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
      onMouseUp={(e) => {
        if (e.button === 2) {
          isDraggingRight.current = false;
          const fromKey = dragFromKey.current;
          dragFromKey.current = null;

          if (phase !== 'mobilization') return;

          if (!hoveredTileCoord || !viewingPlayerId) return;
          const toKey = coordKey(hoveredTileCoord);

          // Confirm: only if this is a stationary right-click (fromKey === toKey) on the destination.
          // A drag from a different tile to the destination should add a source, not confirm.
          if (pendingAction !== null && toKey === pendingAction.destinationKey && fromKey === toKey) {
            const activeSources = Object.fromEntries(
              Object.entries(pendingAction.sources).filter(([, count]) => count > 0)
            );
            const totalTroops = Object.values(activeSources).reduce((a, b) => a + b, 0);
            if (totalTroops > 0) {
              const apCost = pendingAction.actionType === 'annex'
                ? DEFAULT_CONFIG.mobilization.annexAPCost
                : pendingAction.actionType === 'invade'
                ? DEFAULT_CONFIG.mobilization.invadeAPCost
                : DEFAULT_CONFIG.mobilization.fortifyAPCost;

              if (actionsRemaining < apCost) {
                pushToast({ message: 'Not enough AP', x: e.clientX, y: e.clientY, variant: 'error' });
                return;
              }

              try {
                clearPendingAction();
                lastSourceKey.current = null;
                if (pendingAction.actionType === 'annex') performAnnex(pendingAction.destinationKey, activeSources);
                else if (pendingAction.actionType === 'fortify') performFortify(pendingAction.destinationKey, activeSources);
                else if (pendingAction.actionType === 'invade') performInvade(pendingAction.destinationKey, activeSources);
              } catch (err) {
                pushToast({ message: err instanceof Error ? err.message.replace(/^perform\w+: /, '') : 'Action failed', x: e.clientX, y: e.clientY, variant: 'error' });
              }
            }
            return;
          }

          // New drag gesture — fromKey required from here on
          if (!fromKey) return;
          if (fromKey === toKey) return;

          const fromTile = tiles[fromKey];
          const toTile = tiles[toKey];

          // Source must be an owned tile belonging to the viewing player
          if (!fromTile || fromTile.state !== 'owned' || fromTile.ownerId !== viewingPlayerId) return;

          const lockedArrivals = getLockedArrivalsByTile(useGameStore.getState().relocatedTroops);
          const availableTroops = fromTile.troops - (lockedArrivals[fromKey] ?? 0);
          if (availableTroops <= 0) {
            pushToast({ message: 'No troops available', x: e.clientX, y: e.clientY, variant: 'error' });
            return;
          }

          // Infer action type from destination
          let actionType: 'fortify' | 'annex' | 'invade';
          if (toTile?.state === 'unclaimed') {
            actionType = 'annex';
          } else if (toTile?.state === 'barbarian') {
            actionType = 'invade';
          } else if (toTile?.state === 'owned' && toTile.ownerId === viewingPlayerId) {
            actionType = 'fortify';
          } else {
            pushToast({ message: "Can't move there", x: e.clientX, y: e.clientY, variant: 'error' });
            return;
          }

          // Annex: target must be adjacent to owned territory
          if (actionType === 'annex') {
            const annexable = getAnnexableTileKeys();
            if (!annexable.has(toKey)) {
              pushToast({ message: 'Must be adjacent to your territory', x: e.clientX, y: e.clientY, variant: 'error' });
              return;
            }
          }

          // Invade: source must be adjacent to destination
          if (actionType === 'invade') {
            const adjacentKeys = new Set(hexNeighbors(fromTile.coord).map(coordKey));
            if (!adjacentKeys.has(toKey)) {
              pushToast({ message: 'Must be adjacent to invade', x: e.clientX, y: e.clientY, variant: 'error' });
              return;
            }
          }

          // If a pending action exists for the same destination and same action type, add this source
          if (pendingAction !== null && pendingAction.destinationKey === toKey && pendingAction.actionType === actionType) {
            addPendingSource(fromKey, 1, getAvailable(fromKey));
            lastSourceKey.current = fromKey;
          } else {
            // Start a new pending action (replaces any existing one)
            setPendingAction({ destinationKey: toKey, actionType, sources: { [fromKey]: Math.min(1, getAvailable(fromKey)) } });
            lastSourceKey.current = fromKey;
          }

          return;
        }

        // Left button: stop pan
        isPanning.current = false;
      }}
      onMouseLeave={() => {
        isPanning.current = false;
        isDraggingRight.current = false;
        dragFromKey.current = null;
      }}
      onWheel={(e) => {
        if (hoveredTileCoord !== null) {
          const hKey = coordKey(hoveredTileCoord);
          const freshPending = useUIStore.getState().pendingAction;
          if (freshPending !== null) {
            // Determine which source key to adjust:
            // - if hovering a source tile directly, use it
            // - if hovering the destination tile, fall back to the most recently added source
            let adjustKey: string | null = null;
            if (hKey in freshPending.sources) {
              adjustKey = hKey;
            } else if (hKey === freshPending.destinationKey && lastSourceKey.current !== null && lastSourceKey.current in freshPending.sources) {
              adjustKey = lastSourceKey.current;
            }

            if (adjustKey !== null) {
              const t = tiles[adjustKey];
              if (t && t.state === 'owned') {
                const lockedArrivals = getLockedArrivalsByTile(useGameStore.getState().relocatedTroops);
                const max = Math.max(0, t.troops - (lockedArrivals[adjustKey] ?? 0));
                adjustPendingSource(adjustKey, e.deltaY < 0 ? 1 : -1, max);
              }
              return;
            }
          }
        }
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Cursor position relative to container center
        const mouseX = e.clientX - rect.left - rect.width  / 2;
        const mouseY = e.clientY - rect.top  - rect.height / 2;
        // Read current values synchronously to avoid stale closure in setState callbacks
        const currentZoom = zoom;
        const currentPan  = pan;
        const next = Math.max(0.4, Math.min(6, currentZoom * factor));
        // Derive the map-local point under the cursor, then solve for pan that keeps it fixed:
        // newPan = mouse - ((mouse - currentPan) / currentZoom) * next
        const newPanX = mouseX - ((mouseX - currentPan.x) / currentZoom) * next;
        const newPanY = mouseY - ((mouseY - currentPan.y) / currentZoom) * next;
        setZoom(next);
        setPan(clampPan(newPanX, newPanY, next));
      }}
    >
    <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
      <defs>
        <filter id="terrain-plains" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.5  * zoom} numOctaves="2" seed="1" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-forest" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.4 * zoom} numOctaves="4" seed="2" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-hills" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency={0.35 * zoom} numOctaves="3" seed="3" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-desert" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.25 * zoom} numOctaves="2" seed="4" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="terrain-coast" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.3 * zoom} numOctaves="2" seed="5" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
          <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>
      <g transform={`translate(${xOffset},${yOffset})`}>
        {/* Layer 1: tile fills */}
        {tileList.map((tile) => {
          const tKey = coordKey(tile.coord);
          const isDraftSource = pendingAction !== null && (pendingAction.sources[tKey] ?? 0) > 0;
          const isAnnexTarget = pendingAction !== null && tKey === pendingAction.destinationKey;
          const draftCount = (() => {
            if (pendingAction === null) return undefined;
            if (tKey === pendingAction.destinationKey) {
              const total = Object.values(pendingAction.sources).reduce((a, b) => a + b, 0);
              return total > 0 ? total : undefined;
            }
            const sourceCount = pendingAction.sources[tKey];
            if (sourceCount !== undefined && sourceCount > 0) return -sourceCount;
            return undefined;
          })();
          const lockedArrivals = lockedArrivalsByTile[tKey] ?? 0;
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
                tiles={tiles}
                isDraftSource={isDraftSource}
                isAnnexTarget={isAnnexTarget}
                activePolicy={activePolicy}
                humanPlayerId={humanPlayer?.id}
                draftCount={draftCount}
                lockedArrivals={lockedArrivals}
                onClick={() => {
                  if (pendingAction !== null && pendingAction.sources[tKey] !== undefined) {
                    adjustPendingSource(tKey, -1);
                  } else {
                    selectTile(tile.coord);
                  }
                }}
              />
            </g>
          );
        })}

        {/* Layer 1.5: pending action arrows */}
        {pendingAction !== null && Object.entries(pendingAction.sources)
          .filter(([, count]) => count > 0)
          .map(([sourceKey]) => {
            const sourceTile = tiles[sourceKey];
            const destTile = tiles[pendingAction.destinationKey];
            if (!sourceTile || !destTile) return null;
            const from = getPixel(sourceTile.coord);
            const to = getPixel(destTile.coord);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return null;
            const ux = dx / len;
            const uy = dy / len;
            const pad = hexSize * 0.45;
            const x1 = from.x + ux * pad;
            const y1 = from.y + uy * pad;
            const x2 = to.x - ux * pad;
            const y2 = to.y - uy * pad;
            const headLen = hexSize * 0.25;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const ax1 = x2 - headLen * Math.cos(angle - 0.4);
            const ay1 = y2 - headLen * Math.sin(angle - 0.4);
            const ax2 = x2 - headLen * Math.cos(angle + 0.4);
            const ay2 = y2 - headLen * Math.sin(angle + 0.4);
            return (
              <g key={`arrow-${sourceKey}`} style={{ pointerEvents: 'none' }}>
                <line
                  x1={x1.toFixed(2)} y1={y1.toFixed(2)}
                  x2={x2.toFixed(2)} y2={y2.toFixed(2)}
                  stroke="#ffffff" strokeWidth={2} strokeOpacity={0.7} strokeDasharray="4 3"
                />
                <polyline
                  points={`${ax1.toFixed(2)},${ay1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${ax2.toFixed(2)},${ay2.toFixed(2)}`}
                  fill="none" stroke="#ffffff" strokeWidth={2} strokeOpacity={0.7}
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
