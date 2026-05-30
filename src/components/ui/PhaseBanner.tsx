import { useGameStore } from '../../store/gameStore';

export function PhaseBanner() {
  const currentTurn = useGameStore((state) => state.currentTurn);
  const phase = useGameStore((state) => state.phase);

  const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1);

  return (
    <div
      style={{
        height: 36,
        flexShrink: 0,
        background: '#0f1923',
        borderBottom: '1px solid #1e2d3a',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#c0c8d0',
      }}
    >
      Turn {currentTurn} — {phaseName} phase
    </div>
  );
}
