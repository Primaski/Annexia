import React, { useState } from 'react';
import { MapFilters } from '../map/MapFilters';
import { useUIStore } from '../../store/uiStore';
import { startSimulation, stopSimulation, advanceSimStep } from '../../hooks/useGame';

const btnStyle = (active = false): React.CSSProperties => ({
  padding: '4px 10px',
  fontFamily: 'monospace',
  fontSize: 12,
  background: active ? '#c0c8d0' : '#1e2d3a',
  color: active ? '#0f1923' : '#c0c8d0',
  border: '1px solid #2a3f50',
  cursor: 'pointer',
});

export function BottomBar() {
  const [lensOpen, setLensOpen] = useState(false);
  const simulationMode = useUIStore((state) => state.simulationMode);
  const simAutoAdvance = useUIStore((state) => state.simAutoAdvance);
  const setSimAutoAdvance = useUIStore((state) => state.setSimAutoAdvance);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        alignItems: 'center',
        paddingLeft: 12,
        gap: 8,
        fontFamily: 'monospace',
        background: '#0f1923',
      }}
    >
      <div style={{ position: 'relative' }}>
        {lensOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 0,
              background: '#0f1923',
              border: '1px solid #1e2d3a',
              padding: '8px 12px',
              display: 'flex',
              gap: 6,
            }}
          >
            <MapFilters />
          </div>
        )}
        <button onClick={() => setLensOpen(!lensOpen)} style={btnStyle(lensOpen)}>
          Lens
        </button>
      </div>

      {!simulationMode ? (
        <button onClick={startSimulation} style={btnStyle()}>▶ Simulate</button>
      ) : (
        <>
          <button onClick={stopSimulation} style={btnStyle()}>⏹ Stop</button>
          <button onClick={() => setSimAutoAdvance(!simAutoAdvance)} style={btnStyle(simAutoAdvance)}>
            {simAutoAdvance ? 'Auto' : 'Step'}
          </button>
          {!simAutoAdvance && (
            <button onClick={advanceSimStep} style={btnStyle()}>→ Next</button>
          )}
        </>
      )}
    </div>
  );
}
