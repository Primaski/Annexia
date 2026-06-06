import { createPortal } from 'react-dom';
import type { ActiveEffect } from '../../types';

export type CardTooltipEffect = Pick<
  ActiveEffect,
  'title' | 'description' | 'type' | 'magnitude' | 'turnsRemaining' | 'icon' | 'enabled'
>;

export function effectTypeImage(type: string): string {
  if (type === 'troop_income') return 'https://png.pngtree.com/png-clipart/20241203/original/pngtree-very-young-soldier-png-image_17519971.png';
  if (type === 'budget_income') return 'https://png.pngtree.com/png-clipart/20241117/original/pngtree-cute-green-money-bag-clipart-illustration-png-image_17168835.png';
  return 'https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=effect';
}

export function formatMechanical(effect: CardTooltipEffect): string {
  const sign = effect.magnitude >= 0 ? '+' : '';
  const duration = effect.turnsRemaining === null ? 'permanent' : `${effect.turnsRemaining} turns`;
  if (effect.type === 'troop_income') return `${sign}${effect.magnitude} troops/turn · ${duration}`;
  if (effect.type === 'budget_income') return `${sign}${effect.magnitude} gold/turn · ${duration}`;
  return `magnitude: ${effect.magnitude}`;
}

export function CardTooltipContent({
  effect,
  mousePos,
}: {
  effect: CardTooltipEffect;
  mousePos: { x: number; y: number };
}): JSX.Element {
  const TOOLTIP_W = 150;
  const TOOLTIP_H = 155;
  const OFFSET = 10;
  const clipsRight  = mousePos.x + OFFSET + TOOLTIP_W > window.innerWidth;
  const clipsBottom = mousePos.y + OFFSET + TOOLTIP_H > window.innerHeight;
  const flip = clipsRight || clipsBottom;
  const left = flip ? mousePos.x - OFFSET - TOOLTIP_W : mousePos.x + OFFSET;
  const top  = flip ? mousePos.y - OFFSET - TOOLTIP_H : mousePos.y + OFFSET;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left,
        top,
        background: '#1a2a35',
        border: '1px solid #2a3f50',
        borderRadius: 4,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        width: 200,
        boxSizing: 'border-box',
        whiteSpace: 'normal',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div style={{ fontSize: 20, color: '#e0e8f0', fontWeight: 'bold', textAlign: 'center' }}>
        {effect.title}
      </div>
      <img src={effectTypeImage(effect.type)} alt={effect.type} width={48} height={48} />
      <div style={{ fontSize: 14, color: '#c0c8d0', textAlign: 'center', wordBreak: 'break-word' }}>
        {effect.description}
      </div>
      <div style={{ fontSize: 14, color: '#8aa0b0', textAlign: 'center' }}>
        {formatMechanical(effect)}
      </div>
      {'enabled' in effect && !effect.enabled && (
        <div style={{ fontSize: 14, color: '#c0392b', fontWeight: 'bold', letterSpacing: 1 }}>
          DISABLED
        </div>
      )}
    </div>,
    document.body,
  );
}
