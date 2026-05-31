import{ useGameStore } from '../../../store/gameStore';
import { useUIStore } from '../../../store/uiStore';
import { submitPolicyChoice, finishPolicyPhase, processAITurns } from '../../../hooks/useGame';
import { Sprite } from '../Sprite';
import type { Tribune } from '../../../types';

function findReactions(
  councilTribunes: Tribune[],
  policyId: string,
): { proponent: Tribune | null; objector: Tribune | null } {
  let proponent: Tribune | null = null;
  let objector: Tribune | null = null;
  let maxBias = 0;
  let minBias = 0;

  for (const tribune of councilTribunes) {
    const stance = tribune.policyStances[policyId];
    if (!stance) continue;
    if (stance.bias > maxBias) {
      maxBias = stance.bias;
      proponent = tribune;
    }
    if (stance.bias < minBias) {
      minBias = stance.bias;
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

  const humanPlayer = players.find((p) => p.isHuman);
  const policy = activePolicyCards[currentPolicyCardIndex];

  if (!policy || !humanPlayer) return null;

  // ── Veto screen ────────────────────────────────────────────────────────────
  if (vetoResult !== null) {
    const vetoingTribune = tribunes.find((t) => t.id === vetoResult.tribuneId);
    const flavorText = vetoingTribune?.policyStances[vetoResult.policyId]?.flavor ?? 'Not a concern of mine.';

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 24, color: '#c93b3b', letterSpacing: '0.15em' }}>VETOED</div>
        {vetoingTribune && (
          <>
            <Sprite imagePath={vetoingTribune.imagePath} name={vetoingTribune.name} size={64} />
            <div style={{ fontSize: 12, color: '#8aa0b0' }}>{vetoingTribune.name}</div>
          </>
        )}
        <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>{flavorText}</div>
        <button
          onClick={handleContinue}
          style={{
            width: '100%',
            padding: '8px 0',
            fontFamily: 'monospace',
            fontSize: 13,
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
  const { proponent, objector } = findReactions(councilTribunes, policy.id);
  const reactionStrip = [proponent, objector].filter((t): t is Tribune => t !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, color: '#5a7a8a', letterSpacing: '0.08em' }}>
        Policy — Card {currentPolicyCardIndex + 1} of {activePolicyCards.length}
      </div>

      <div style={{ fontSize: 16, color: '#e0e8f0' }}>{policy.title}</div>

      <div style={{ fontSize: 12, lineHeight: 1.5, color: '#c0c8d0' }}>{policy.description}</div>

      {reactionStrip.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reactionStrip.map((tribune) => {
            const flavor = tribune.policyStances[policy.id]?.flavor ?? 'Not a concern of mine.';
            return (
              <div
                key={tribune.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <Sprite imagePath={tribune.imagePath} name={tribune.name} size={40} />
                  <div style={{ fontSize: 10, color: '#5a7a8a' }}>{tribune.name}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: '#1e2d3a',
                    border: '1px solid #2a3f50',
                    padding: '6px 10px',
                    fontFamily: 'monospace',
                    fontSize: 12,
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(['Approve', 'Decline'] as const).map((label, index) => (
          <button
            key={index}
            onClick={() => submitPolicyChoice(index)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: 13,
              background: '#1e2d3a',
              color: '#c0c8d0',
              border: '1px solid #2a3f50',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
