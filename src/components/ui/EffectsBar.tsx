import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { ActiveEffect } from '../../types';

function EffectIcon({ effect }: { effect: ActiveEffect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: '#1a2a35',
          border: effect.enabled ? '1px solid #2a3f50' : '1px solid #7a2020',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          cursor: 'default',
          opacity: effect.enabled ? 1 : 0.4,
          position: 'relative',
        }}
      >
        {effect.icon}
        {!effect.enabled && (
          <div
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#c0392b',
            }}
          />
        )}
      </div>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 36,
            background: '#0f1923',
            border: '1px solid #2a3f50',
            borderRadius: 4,
            padding: '6px 8px',
            width: 190,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#c0c8d0',
            pointerEvents: 'none',
            zIndex: 100,
            whiteSpace: 'normal',
            lineHeight: 1.4,
          }}
        >
          <div>{effect.description}</div>
          <div style={{ marginTop: 4, color: '#8899a6' }}>
            {effect.turnsRemaining === null ? 'Permanent' : `${effect.turnsRemaining} turns remaining`}
          </div>
          {!effect.enabled && (
            <div style={{ marginTop: 4, color: '#c0392b', fontWeight: 'bold', letterSpacing: 1 }}>
              DISABLED
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EffectsBar() {
  const players = useGameStore((state) => state.players);
  const humanPlayer = players.find((p) => p.isHuman);

  if (!humanPlayer || humanPlayer.activeEffects.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 52,
        left: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 10,
      }}
    >
      {humanPlayer.activeEffects.map((effect) => (
        <EffectIcon key={effect.id} effect={effect} />
      ))}
    </div>
  );
}
