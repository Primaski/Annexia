import { useState } from 'react';
import{ useGameStore } from '../../../store/gameStore';
import { useUIStore } from '../../../store/uiStore';
import { submitPolicyChoice, finishPolicyPhase, processAITurns } from '../../../hooks/useGame';
import { Sprite } from '../Sprite';
import type { Tribune, Policy, TraitVector, ActiveEffect } from '../../../types';
import { CardTooltipContent } from '../CardTooltip';

type EffectPreview = Omit<ActiveEffect, 'id' | 'sourcePlayerId' | 'targetPlayerIds'>;

function CardChip({ effect }: { effect: EffectPreview }) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMousePos(null); }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: '#1a2a35',
          border: '1px solid #2a3f50',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: 13,
          color: '#c0c8d0',
        }}
      >
        <span>Grants:</span>
        <span>{effect.icon}</span>
      </div>

      {hovered && mousePos !== null && <CardTooltipContent effect={effect} mousePos={mousePos} />}
    </div>
  );
}

function computeInlineBias(tribune: Tribune, policy: Policy): number {
  const override = policy.tribuneReactions?.[tribune.id]?.biasOverride;
  if (override !== undefined) return override;
  let dot = 0;
  let shiftMagnitude = 0;
  for (const [trait, shift] of Object.entries(policy.alignmentShift) as [string, number][]) {
    dot += (tribune.traitWeights[trait as keyof TraitVector] ?? 0) * shift;
    shiftMagnitude += Math.abs(shift);
  }
  if (shiftMagnitude === 0) return 0;
  return Math.max(-1, Math.min(1, dot / shiftMagnitude));
}

function findReactions(
  councilTribunes: Tribune[],
  policy: Policy,
): { proponent: Tribune | null; objector: Tribune | null } {
  let proponent: Tribune | null = null;
  let objector: Tribune | null = null;
  let maxBias = 0;
  let minBias = 0;

  for (const tribune of councilTribunes) {
    const bias = computeInlineBias(tribune, policy);
    if (bias > maxBias) {
      maxBias = bias;
      proponent = tribune;
    }
    if (bias < minBias) {
      minBias = bias;
      objector = tribune;
    }
  }

  return { proponent, objector };
}

export function PolicyPanel() {
  const activePolicyCards        = useGameStore((state) => state.activePolicyCards);
  const currentPolicyCardIndex   = useGameStore((state) => state.currentPolicyCardIndex);
  const setCurrentPolicyCardIndex = useGameStore((state) => state.setCurrentPolicyCardIndex);
  const tribunes                 = useGameStore((state) => state.tribunes);
  const players                  = useGameStore((state) => state.players);
  const vetoResult               = useUIStore((state) => state.vetoResult);
  const clearVetoResult          = useUIStore((state) => state.clearVetoResult);
  const setPolicyHoverChoice     = useUIStore((state) => state.setPolicyHoverChoice);

  const viewingPlayerId = useUIStore((state) => state.viewingPlayerId);
  const humanPlayer = players.find((p) => p.id === viewingPlayerId);
  const policy = activePolicyCards[currentPolicyCardIndex];

  if (!policy || !humanPlayer) return null;

  // ── Veto screen ────────────────────────────────────────────────────────────
  if (vetoResult !== null) {
    const vetoingTribune = tribunes.find((t) => t.id === vetoResult.tribuneId);
    const vetoedPolicy = activePolicyCards.find(p => p.id === vetoResult.policyId);
    const flavorText = (vetoingTribune && vetoedPolicy)
      ? (vetoedPolicy.tribuneReactions?.[vetoingTribune.id]?.flavor ?? vetoingTribune.disagreeText)
      : 'Not a concern of mine.';

    const handleContinue = () => {
      clearVetoResult();
      const nextIndex = currentPolicyCardIndex + 1;
      if (nextIndex < activePolicyCards.length) {
        setCurrentPolicyCardIndex(nextIndex);
      } else {
        processAITurns();
        finishPolicyPhase();
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ fontSize: 26, color: '#c93b3b', letterSpacing: '0.15em' }}>VETOED</div>
        {vetoingTribune && (
          <>
            <Sprite imagePath={vetoingTribune.imagePath} name={vetoingTribune.name} size={64} />
            <div style={{ fontSize: 14, color: '#8aa0b0' }}>{vetoingTribune.name}</div>
          </>
        )}
        <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>{flavorText}</div>
        <button
          onClick={handleContinue}
          style={{
            width: '100%',
            padding: '10px 0',
            fontFamily: 'monospace',
            fontSize: 15,
            background: '#1e2d3a',
            color: '#c0c8d0',
            border: '1px solid #2a3f50',
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  // ── Policy card ────────────────────────────────────────────────────────────
  const councilTribunes = tribunes.filter((t) => humanPlayer.tribuneIds.includes(t.id));
  const { proponent, objector } = findReactions(councilTribunes, policy);
  const reactionStrip = [proponent, objector].filter((t): t is Tribune => t !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 13, color: '#5a7a8a', letterSpacing: '0.08em' }}>
        Policy — Card {currentPolicyCardIndex + 1} of {activePolicyCards.length}
      </div>

      <div style={{ fontSize: 18, color: '#e0e8f0' }}>{policy.title}</div>

      <div style={{ fontSize: 14, lineHeight: 1.5, color: '#c0c8d0' }}>{policy.description}</div>

      {reactionStrip.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reactionStrip.map((tribune) => {
            const bias = computeInlineBias(tribune, policy);
            const flavor = policy.tribuneReactions?.[tribune.id]?.flavor
              ?? (bias >= 0 ? tribune.agreeText : tribune.disagreeText);
            return (
              <div
                key={tribune.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <Sprite imagePath={tribune.imagePath} name={tribune.name} size={40} />
                  <div style={{ fontSize: 12, color: '#5a7a8a' }}>{tribune.name}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: '#1e2d3a',
                    border: '1px solid #2a3f50',
                    padding: '6px 10px',
                    fontFamily: 'monospace',
                    fontSize: 14,
                    color: '#c0c8d0',
                  }}
                >
                  {flavor}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(['Approve', 'Decline'] as const).map((label, index) => {
          const effect = index === 0 ? policy.approveEffect : policy.declineEffect;
          return (
            <button
              key={index}
              onClick={() => submitPolicyChoice(index)}
              onMouseEnter={() => setPolicyHoverChoice(index as 0 | 1)}
              onMouseLeave={() => setPolicyHoverChoice(null)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontFamily: 'monospace',
                fontSize: 15,
                background: '#1e2d3a',
                color: '#c0c8d0',
                border: '1px solid #2a3f50',
                cursor: 'pointer',
                textAlign: 'left',
                height: 'auto',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {label}
                {effect && <CardChip effect={effect} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
