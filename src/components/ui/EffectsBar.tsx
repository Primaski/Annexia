import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import type { ActiveEffect } from '../../types';
import { CardTooltipContent, effectTypeImage, formatMechanical } from './CardTooltip';

type EffectGroup = {
  title: string;
  effects: ActiveEffect[];
  representative: ActiveEffect;
};

function EffectIcon({ group }: { group: EffectGroup }) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const { representative, effects } = group;
  const isEnabled = effects.some((e) => e.enabled);
  const allDisabled = effects.every((e) => !e.enabled);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMousePos(null); }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: '#1a2a35',
          border: isEnabled ? '1px solid #2a3f50' : '1px solid #7a2020',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          cursor: 'default',
          opacity: isEnabled ? 1 : 0.4,
          position: 'relative',
        }}
      >
        {representative.icon}
        {allDisabled && (
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

      {effects.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            background: '#2a3f50',
            border: '1px solid #0f1923',
            borderRadius: 999,
            width: 16,
            height: 16,
            fontSize: 9,
            color: '#c0c8d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
          }}
        >
          {effects.length}
        </div>
      )}

      {hovered && mousePos && effects.length > 1 && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 14,
            top: mousePos.y + 20,
            background: '#1a2a35',
            border: '1px solid #2a3f50',
            borderRadius: 4,
            padding: '10px 12px',
            width: 160,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 200,
            fontFamily: 'monospace',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 13, color: '#e0e8f0', fontWeight: 'bold', textAlign: 'center' }}>
            {representative.title}
          </div>
          <img src={effectTypeImage(representative.type)} alt={representative.type} width={48} height={48} />
          <div style={{ fontSize: 11, color: '#c0c8d0', textAlign: 'center', wordBreak: 'break-word' }}>
            {representative.description}
          </div>
          <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #2a3f50', margin: '2px 0' }} />
          {effects.map((effect) => (
            <div
              key={effect.id}
              style={{ fontSize: 11, color: effect.enabled ? '#8aa0b0' : '#c0392b' }}
            >
              {formatMechanical(effect)} · {effect.enabled
                ? (effect.turnsRemaining === null ? 'permanent' : `${effect.turnsRemaining} turns remaining`)
                : 'DISABLED'}
            </div>
          ))}
        </div>
      )}

      {hovered && mousePos && effects.length === 1 && (
        <CardTooltipContent effect={representative} mousePos={mousePos} />
      )}
    </div>
  );
}

export function EffectsBar() {
  const players = useGameStore((state) => state.players);
  const viewingPlayerId = useUIStore((state) => state.viewingPlayerId);
  const viewingPlayer = players.find((p) => p.id === viewingPlayerId);

  if (!viewingPlayer || viewingPlayer.activeEffects.length === 0) return null;

  const groups = viewingPlayer.activeEffects.reduce<EffectGroup[]>((acc, effect) => {
    const existing = acc.find((g) => g.title === effect.title);
    if (existing) {
      existing.effects.push(effect);
    } else {
      acc.push({ title: effect.title, effects: [effect], representative: effect });
    }
    return acc;
  }, []);

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
        background: 'rgba(15, 25, 35, 0.55)',
        borderRadius: 8,
        padding: 6,
      }}
    >
      {groups.map((group) => (
        <EffectIcon key={group.title} group={group} />
      ))}
    </div>
  );
}
