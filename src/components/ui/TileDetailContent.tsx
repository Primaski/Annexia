import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { DEFAULT_CONFIG } from '../../config';
import type { TraitVector } from '../../types';
import { Sprite } from './Sprite';

const TRAITS: { key: keyof TraitVector; pos: string; neg: string }[] = [
  { key: 'ecology',    pos: 'ecology',    neg: 'industry'     },
  { key: 'militarism', pos: 'militarism', neg: 'pacifism'     },
  { key: 'religion',   pos: 'religion',   neg: 'secularism'   },
  { key: 'individualism', pos: 'individualism', neg: 'collectivism' },
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
  const viewingPlayerId    = useUIStore((state) => state.viewingPlayerId);
  const pendingAction      = useUIStore((state) => state.pendingAction);
  const clearPendingAction = useUIStore((state) => state.clearPendingAction);

  const tiles   = useGameStore((state) => state.tiles);
  const players = useGameStore((state) => state.players);
  const nations = useGameStore((state) => state.nations);

  const [loyaltyLogOpen, setLoyaltyLogOpen] = useState(false);

  useEffect(() => {
    setLoyaltyLogOpen(false);
  }, [tileKey]);

  const tile = tiles[tileKey];
  if (!tile || tile.state === 'water') return null;

  const cv = tile.cultureVector;
  return (
    <>
      {tile.state === 'owned' && (() => {
        const owner = players.find((p) => p.id === tile.ownerId);
        const nation = owner?.nationId ? nations[owner.nationId] : null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <Sprite size={100} zoom={1.2} imagePath={owner?.imagePath ?? null} name={owner?.name ?? '?'} />
            <div>
              <div style={{ fontSize: 34, color: '#e0e8f0', fontWeight: 'bold' }}>{nation?.name ?? '—'}</div>
              <div style={{ fontSize: 16, color: '#5a7a8a', marginTop: 4 }}>[{tile.coord.q}, {tile.coord.r}]</div>
            </div>
          </div>
        );
      })()}
      {tile.state !== 'owned' && <div style={{ marginBottom: 4 }}>🏡 {tile.name}</div>}
      {tile.state === 'owned' && <div style={{ marginBottom: 6 }}>🏛️ {tile.name}</div>}
      {tile.state === 'owned' && <div>🛡️ {tile.troops}</div>}

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
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#8a9aaa', marginBottom: 2 }}>
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

      {pendingAction !== null && pendingAction.destinationKey === tileKey && (() => {
        const totalCommitted = Object.values(pendingAction.sources).reduce((a, b) => a + b, 0);
        const activeSourceCount = Object.values(pendingAction.sources).filter(c => c > 0).length;

        let winProbSection: React.ReactNode = null;
        if (pendingAction.actionType === 'invade' && tile.state === 'barbarian') {
          const defenderTroops = tile.troops;
          const prob = totalCommitted < DEFAULT_CONFIG.mobilization.invadeTroopMin
            ? 0
            : calcAttackSuccessProbability(
                totalCommitted,
                defenderTroops,
                DEFAULT_CONFIG.combat.lanchesterExponent,
                DEFAULT_CONFIG.combat.defenderBonus,
              );
          const pct = Math.round(prob * 100);
          const color = pct < 40 ? '#cc4444' : pct < 70 ? '#cc9944' : '#44cc66';
          winProbSection = (
            <div style={{ marginTop: 4 }}>
              <strong style={{ color }}>⚔️ Success probability: {pct}%</strong>
            </div>
          );
        }

        return (
          <>
            {divider}
            <div style={{ fontSize: 16, color: '#5a7a8a', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>
              {pendingAction.actionType.toUpperCase()}
            </div>
            <div style={{ fontSize: 16, color: '#c0c8d0', marginTop: 2 }}>
              {totalCommitted} troop{totalCommitted !== 1 ? 's' : ''} from {activeSourceCount} tile{activeSourceCount !== 1 ? 's' : ''}
            </div>
            {winProbSection}
            <button
              onClick={clearPendingAction}
              style={{
                width: '100%', marginTop: 8, padding: '6px 0',
                fontFamily: 'monospace', fontSize: 16,
                background: '#1e2d3a', color: '#c0c8d0',
                border: '1px solid #2a3f50', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {divider}
          </>
        );
      })()}

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
          <div>troops: {tile.troops}</div>
        </>
      )}
    </>
  );
}
