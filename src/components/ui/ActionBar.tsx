import { useGameStore } from '../../store/gameStore';
import { RoundtablePanel } from './phases/RoundtablePanel';
import { PolicyPanel } from './phases/PolicyPanel';
import { CalibrationPanel } from './phases/CalibrationPanel';
import { MobilizationPanel } from './phases/MobilizationPanel';

export function ActionBar() {
  const phase = useGameStore((state) => state.phase);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        padding: '20px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'monospace',
        color: '#c0c8d0',
      }}
    >
      {phase === 'roundtable'   && <RoundtablePanel />}
      {phase === 'policy'       && <PolicyPanel />}
      {phase === 'calibration'  && <CalibrationPanel />}
      {phase === 'mobilization' && <MobilizationPanel />}
    </div>
  );
}
