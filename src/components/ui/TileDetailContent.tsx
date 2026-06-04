import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { coordKey, hexNeighbors } from '../../engine/hex';
import { DEFAULT_CONFIG } from '../../config';
import { getAnnexableTileKeys, performAnnex, performFortify, getInvadableTileKeysForPlayer, performInvade, getReceivedPassiveByTile } from '../../hooks/useGame';
import type { TraitVector, OwnedTile, BarbarianTile } from '../../types';

const TRAITS: { key: keyof TraitVector; pos: string; neg: string }[] = [
  { key: 'ecology',    pos: 'ecology',    neg: 'industry'     },
  { key: 'militarism', pos: 'militarism', neg: 'pacifism'     },
  { key: 'religion',   pos: 'religion',   neg: 'secularism'   },
  { key: 'liberty',    pos: 'liberty',    neg: 'collectivism' },
  { key: 'progress',   pos: 'progress',   neg: 'tradition'    },
];

const divider = <hr style={{ border: 'none', borderTop: '1px solid #1e2d3a', margin: '4px 0' }} />;

function calcAttackSuccessProbability(
  attackers: number,
  defenders: number,
  lanchesterExponent: number,
  defenderBonus: number
): number {
  if (attackers <= 0) return 0;
  if (defenders <= 0) return 1;
  const effectiveDefenders = defenders * defenderBonus;
  return 1 / (1 + Math.pow(effectiveDefenders / attackers, lanchesterExponent));
}

interface TileDetailContentProps {
  tileKey: string;
}

export function TileDetailContent({ tileKey }: TileDetailContentProps) {
  const draftClickKey       = useUIStore((state) => state.draftClickKey);
  const draftSources        = useUIStore((state) => state.draftSources);
  const setDraftModeActive  = useUIStore((state) => state.setDraftModeActive);
  const setInvadeModeActive = useUIStore((state) => state.setInvadeModeActive);
  const setDraftClickKey    = useUIStore((state) => state.setDraftClickKey);
  const setDraftSources     = useUIStore((state) => state.setDraftSources);
  const viewingPlayerId     = useUIStore((state) => state.viewingPlayerId);

  const tiles             = useGameStore((state) => state.tiles);
  const players           = useGameStore((state) => state.players);
  const phase             = useGameStore((state) => state.phase);
  const actionsRemaining  = useGameStore((state) => state.actionsRemaining);
  const spentTroopsByTile = useGameStore((state) => state.spentTroopsByTile);
  const relocatedTroops   = useGameStore((state) => state.relocatedTroops);

  const receivedPassiveByTile = getReceivedPassiveByTile(relocatedTroops);
  const humanPlayer = players.find((p) => p.id === viewingPlayerId);

  const [draftMode,      setDraftMode]      = useState(false);
  const [fortifyMode,    setFortifyMode]    = useState(false);
  const [invadeMode,     setInvadeMode]     = useState(false);
  const [loyaltyLogOpen, setLoyaltyLogOpen] = useState(false);

  useEffect(() => {
    setDraftMode(false);
    setFortifyMode(false);
    setInvadeMode(false);
    setLoyaltyLogOpen(false);
    setDraftModeActive(false);
    setInvadeModeActive(false);
    setDraftSources({});
    setDraftClickKey(null);
  }, [tileKey]);

  useEffect(() => {
    return () => {
      setDraftModeActive(false);
      setInvadeModeActive(false);
      setDraftSources({});
      setDraftClickKey(null);
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
    if (available <= 0) { setDraftClickKey(null); return; }
    setDraftSources({ ...draftSources, [draftClickKey]: alreadyAllocated + 1 });
    setDraftClickKey(null);
  }, [draftClickKey]);

  useEffect(() => {
    if (!draftClickKey || !fortifyMode) return;
    if (draftClickKey === tileKey) { setDraftClickKey(null); return; }
    const clickedTile = tiles[draftClickKey];
    if (!clickedTile || clickedTile.state !== 'owned') { setDraftClickKey(null); return; }
    const owned = clickedTile as OwnedTile;
    if (!humanPlayer || owned.ownerId !== humanPlayer.id) { setDraftClickKey(null); return; }
    const alreadyAllocated = draftSources[draftClickKey] ?? 0;
    const spent = spentTroopsByTile[draftClickKey] ?? 0;
    const available = owned.activeTroops - spent - alreadyAllocated;
    if (available <= 0) { setDraftClickKey(null); return; }
    setDraftSources({ ...draftSources, [draftClickKey]: alreadyAllocated + 1 });
    setDraftClickKey(null);
  }, [draftClickKey]);

  useEffect(() => {
    if (!draftClickKey || !invadeMode) return;
    const tile = tiles[tileKey];
    if (!tile) { setDraftClickKey(null); return; }
    const adjacentKeys = new Set(hexNeighbors(tile.coord).map(coordKey));
    if (!adjacentKeys.has(draftClickKey)) { setDraftClickKey(null); return; }
    const clickedTile = tiles[draftClickKey];
    if (!clickedTile || clickedTile.state !== 'owned') { setDraftClickKey(null); return; }
    const owned = clickedTile as OwnedTile;
    if (!humanPlayer || owned.ownerId !== humanPlayer.id) { setDraftClickKey(null); return; }
    const alreadyAllocated = draftSources[draftClickKey] ?? 0;
    const spent = spentTroopsByTile[draftClickKey] ?? 0;
    const receivedPassive = receivedPassiveByTile[draftClickKey] ?? 0;
    const available = owned.activeTroops - spent - receivedPassive - alreadyAllocated;
    if (available <= 0) { setDraftClickKey(null); return; }
    setDraftSources({ ...draftSources, [draftClickKey]: alreadyAllocated + 1 });
    setDraftClickKey(null);
  }, [draftClickKey]);

  const tile = tiles[tileKey];
  if (!tile || tile.state === 'water') return null;

  const annexableTileKeys = phase === 'mobilization' ? getAnnexableTileKeys() : new Set<string>();
  const isAnnexable = phase === 'mobilization' && tile.state === 'unclaimed' && annexableTileKeys.has(tileKey);
  const annexAPCost   = DEFAULT_CONFIG.mobilization.annexAPCost;
  const annexTroopMin = DEFAULT_CONFIG.mobilization.annexTroopMin;
  const invadeAPCost  = DEFAULT_CONFIG.mobilization.invadeAPCost;
  const invadeTroopMin = DEFAULT_CONFIG.mobilization.invadeTroopMin;
  const draftedSoFar = Object.values(draftSources).reduce((a, b) => a + b, 0);

  const totalAvailableTroops = humanPlayer
    ? Object.values(tiles)
        .filter((t): t is OwnedTile => t.state === 'owned' && (t as OwnedTile).ownerId === humanPlayer.id)
        .reduce((sum, t) => sum + Math.max(0, t.activeTroops - (spentTroopsByTile[coordKey(t.coord)] ?? 0)), 0)
    : 0;
  const canAffordAnnex = actionsRemaining >= annexAPCost && totalAvailableTroops >= annexTroopMin;

  const invadableTileKeys = phase === 'mobilization' ? getInvadableTileKeysForPlayer() : new Set<string>();
  const isInvadable = phase === 'mobilization' && tile.state === 'barbarian' && invadableTileKeys.has(tileKey);
  const adjacentAvailableTroops = phase === 'mobilization' && tile.state === 'barbarian'
    ? hexNeighbors(tile.coord)
        .map((c) => coordKey(c))
        .filter((k) => { const t = tiles[k]; return t && t.state === 'owned' && (t as OwnedTile).ownerId === viewingPlayerId; })
        .reduce((sum, k) => {
          const t = tiles[k] as OwnedTile;
          return sum + Math.max(0, t.activeTroops - (spentTroopsByTile[k] ?? 0) - (receivedPassiveByTile[k] ?? 0));
        }, 0)
    : 0;
  const canInvade = actionsRemaining >= invadeAPCost && adjacentAvailableTroops >= invadeTroopMin;

  const defenderTroops = tile.state === 'barbarian' ? (tile as BarbarianTile).activeTroops : 0;
  const attackSuccessProb = draftedSoFar < invadeTroopMin
    ? 0
    : calcAttackSuccessProbability(draftedSoFar, defenderTroops, DEFAULT_CONFIG.combat.lanchesterExponent, DEFAULT_CONFIG.combat.defenderBonus);
  const attackSuccessPercent = Math.round(attackSuccessProb * 100);
  const probColor = attackSuccessPercent < 40 ? '#cc4444' : attackSuccessPercent < 70 ? '#cc9944' : '#44cc66';

  const connectedAvailableTroops = phase === 'mobilization' && tile.state === 'owned'
    ? Object.entries(tiles)
        .filter(([k, t]) =>
          k !== tileKey &&
          t.state === 'owned' &&
          (t as OwnedTile).ownerId === viewingPlayerId &&
          (t as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0) > 0
        )
        .reduce((sum, [k, t]) => sum + Math.max(0, (t as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0)), 0)
    : 0;
  const canFortify = actionsRemaining > 0 && connectedAvailableTroops > 0;

  const cv = tile.cultureVector;

  return (
    <>
      {tile.state !== 'unclaimed' && <div style={{ marginBottom: 4 }}>🏡 {tile.name}</div>}
      {tile.state === 'owned' && <div>🛡️ {tile.activeTroops}</div>}

      {divider}

      {tile.state === 'owned' && (
        <>
          <div>{players.find((p) => p.id === tile.ownerId)?.governmentType ?? '—'}</div>
          {(() => {
            const hasLoyaltyIntel = false; // TODO: check player's activeEffects for a loyalty-intel effect
            const canViewLoyalty = tile.ownerId === viewingPlayerId || hasLoyaltyIntel;
            if (!canViewLoyalty) return null;
            const loyaltyDisplay = Math.round(tile.loyalty * 100);
            const totalDelta = tile.loyaltyLog.reduce((sum, e) => sum + e.delta, 0);
            const deltaDisplay = Math.round(totalDelta * 100);
            const deltaColor = deltaDisplay < 0 ? '#cc4444' : deltaDisplay > 0 ? '#44cc66' : '#5a7a8a';
            const deltaStr = deltaDisplay === 0 ? '' : deltaDisplay > 0 ? ` (+${deltaDisplay})` : ` (${deltaDisplay})`;
            return (
              <div>
                <div
                  onClick={() => tile.loyaltyLog.length > 0 && setLoyaltyLogOpen(o => !o)}
                  style={{ cursor: tile.loyaltyLog.length > 0 ? 'pointer' : 'default', userSelect: 'none' }}
                >
                  <span>😊 {loyaltyDisplay}</span>
                  {deltaStr && <span style={{ color: deltaColor }}>{deltaStr}</span>}
                  {tile.loyaltyLog.length > 0 && <span style={{ color: '#5a7a8a', marginLeft: 4 }}>{loyaltyLogOpen ? '▲' : '▼'}</span>}
                </div>
                {loyaltyLogOpen && (
                  <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid #1e2d3a' }}>
                    {tile.loyaltyLog.map((entry, i) => {
                      const entryDelta = Math.round(entry.delta * 100);
                      const entryColor = entryDelta < 0 ? '#cc4444' : entryDelta > 0 ? '#44cc66' : '#5a7a8a';
                      const entryStr = entryDelta > 0 ? `+${entryDelta}` : `${entryDelta}`;
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a9aaa', marginBottom: 2 }}>
                          <span>{entry.label}</span>
                          <span style={{ color: entryColor, marginLeft: 8 }}>{entryStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
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
            {canAffordAnnex ? 'Annex' : actionsRemaining < annexAPCost ? 'Annex (insufficient AP)' : 'Annex (insufficient troops)'}
          </button>
        </>
      )}

      {isAnnexable && draftMode && (
        <>
          {divider}
          <div style={{ fontSize: 11, color: '#5a7a8a', marginBottom: 4 }}>
            Troops committed: {draftedSoFar} (min {annexTroopMin})
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
              disabled={draftedSoFar < annexTroopMin}
              onClick={() => {
                if (draftedSoFar >= annexTroopMin) {
                  performAnnex(tileKey, draftSources);
                  setDraftMode(false);
                  setDraftModeActive(false);
                  setDraftSources({});
                  setDraftClickKey(null);
                }
              }}
              style={{
                flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
                background: draftedSoFar >= annexTroopMin ? '#1e4a2a' : '#0f1923',
                color: draftedSoFar >= annexTroopMin ? '#80cc90' : '#3a5060',
                border: `1px solid ${draftedSoFar >= annexTroopMin ? '#2a6a3a' : '#1a2530'}`,
                cursor: draftedSoFar >= annexTroopMin ? 'pointer' : 'not-allowed',
              }}
            >Confirm</button>
            <button
              onClick={() => { setDraftMode(false); setDraftModeActive(false); setDraftSources({}); setDraftClickKey(null); }}
              style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12, background: '#1e2d3a', color: '#c0c8d0', border: '1px solid #2a3f50', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </>
      )}

      {phase === 'mobilization' && tile.state === 'owned' && tile.ownerId === viewingPlayerId && !draftMode && !fortifyMode && (
        <>
          {divider}
          <button
            disabled={!canFortify}
            onClick={() => { if (canFortify) { setFortifyMode(true); setDraftModeActive(true); } }}
            style={{
              width: '100%', padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
              background: canFortify ? '#1e2d3a' : '#0f1923',
              color: canFortify ? '#c0c8d0' : '#3a5060',
              border: `1px solid ${canFortify ? '#2a3f50' : '#1a2530'}`,
              cursor: canFortify ? 'pointer' : 'not-allowed',
            }}
          >
            {actionsRemaining === 0 ? 'Fortify (no AP)' : connectedAvailableTroops === 0 ? 'Fortify (no troops)' : 'Fortify'}
          </button>
        </>
      )}

      {phase === 'mobilization' && tile.state === 'owned' && tile.ownerId === viewingPlayerId && fortifyMode && (
        <>
          {divider}
          <div style={{ fontSize: 11, color: '#5a7a8a', marginBottom: 4 }}>
            Moving {draftedSoFar} troop{draftedSoFar !== 1 ? 's' : ''} here
          </div>
          <div style={{ fontSize: 11, color: '#7a9aaa', marginBottom: 8 }}>
            Click highlighted tiles to move troops here.
          </div>
          {Object.entries(draftSources).map(([key, count]) => (
            <div key={key} style={{ fontSize: 11, color: '#c0c8d0' }}>
              {(tiles[key] as OwnedTile | undefined)?.name ?? key}: {count} troop{count !== 1 ? 's' : ''}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              disabled={draftedSoFar === 0}
              onClick={() => {
                if (draftedSoFar > 0) {
                  performFortify(tileKey, draftSources);
                  setFortifyMode(false);
                  setDraftModeActive(false);
                  setDraftSources({});
                  setDraftClickKey(null);
                }
              }}
              style={{
                flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
                background: draftedSoFar > 0 ? '#1e4a2a' : '#0f1923',
                color: draftedSoFar > 0 ? '#80cc90' : '#3a5060',
                border: `1px solid ${draftedSoFar > 0 ? '#2a6a3a' : '#1a2530'}`,
                cursor: draftedSoFar > 0 ? 'pointer' : 'not-allowed',
              }}
            >Confirm</button>
            <button
              onClick={() => { setFortifyMode(false); setDraftModeActive(false); setDraftSources({}); setDraftClickKey(null); }}
              style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12, background: '#1e2d3a', color: '#c0c8d0', border: '1px solid #2a3f50', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </>
      )}

      <div style={{ marginTop: 4, marginBottom: 2, color: '#5a7a8a' }}>Traits:</div>
      {TRAITS.map(({ key, pos, neg }) => {
        const v = cv[key];
        let name: string;
        let val: string;
        if (v >= 0.5)       { name = pos; val = String(Math.round(v * 100)); }
        else if (v <= -0.5) { name = neg; val = String(Math.round(-v * 100)); }
        else if (v > 0)     { name = pos; val = String(Math.round(v * 100)); }
        else                { name = neg; val = String(Math.round(-v * 100)); }
        const text = `${name}: ${val}`;
        const bold = v >= 0.5 || v <= -0.5;
        return (
          <div key={key}>
            {bold ? <strong style={{ color: '#4CAF50' }}>{text}</strong> : text}
          </div>
        );
      })}

      {tile.state === 'barbarian' && (
        <>
          {divider}
          <div>troops: {tile.activeTroops}</div>
        </>
      )}

      {isInvadable && !invadeMode && !draftMode && !fortifyMode && (
        <>
          {divider}
          <button
            disabled={!canInvade}
            onClick={() => { if (canInvade) { setInvadeMode(true); setDraftModeActive(true); setInvadeModeActive(true); } }}
            style={{
              width: '100%', padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
              background: canInvade ? '#1e2d3a' : '#0f1923',
              color: canInvade ? '#c0c8d0' : '#3a5060',
              border: `1px solid ${canInvade ? '#2a3f50' : '#1a2530'}`,
              cursor: canInvade ? 'pointer' : 'not-allowed',
            }}
          >
            {canInvade ? 'Invade' : actionsRemaining < invadeAPCost ? 'Invade (no AP)' : 'Invade (no adjacent troops)'}
          </button>
        </>
      )}

      {isInvadable && invadeMode && (
        <>
          {divider}
          <div style={{ fontSize: 11, color: '#5a7a8a', marginBottom: 4 }}>
            Drafting invasion force: {draftedSoFar} troops
          </div>
          <div style={{ fontSize: 11, color: '#7a9aaa', marginBottom: 8 }}>
            Only adjacent tiles can contribute troops.
          </div>
          {Object.entries(draftSources).map(([key, count]) => (
            <div key={key} style={{ fontSize: 11, color: '#c0c8d0' }}>
              {(tiles[key] as OwnedTile | undefined)?.name ?? key}: {count} troop{count !== 1 ? 's' : ''}
            </div>
          ))}
          <div style={{ marginTop: 6 }}>
            <strong style={{ color: probColor }}>⚔️ Success probability: {attackSuccessPercent}%</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              disabled={draftedSoFar < invadeTroopMin}
              onClick={() => {
                if (draftedSoFar >= invadeTroopMin) {
                  performInvade(tileKey, draftSources);
                  setInvadeMode(false);
                  setDraftModeActive(false);
                  setInvadeModeActive(false);
                  setDraftSources({});
                  setDraftClickKey(null);
                }
              }}
              style={{
                flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12,
                background: draftedSoFar >= invadeTroopMin ? '#1e4a2a' : '#0f1923',
                color: draftedSoFar >= invadeTroopMin ? '#80cc90' : '#3a5060',
                border: `1px solid ${draftedSoFar >= invadeTroopMin ? '#2a6a3a' : '#1a2530'}`,
                cursor: draftedSoFar >= invadeTroopMin ? 'pointer' : 'not-allowed',
              }}
            >Confirm</button>
            <button
              onClick={() => { setInvadeMode(false); setDraftModeActive(false); setInvadeModeActive(false); setDraftSources({}); setDraftClickKey(null); }}
              style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 12, background: '#1e2d3a', color: '#c0c8d0', border: '1px solid #2a3f50', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </>
      )}
    </>
  );
}
