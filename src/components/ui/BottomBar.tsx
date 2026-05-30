import { useState } from 'react';
import { MapFilters } from '../map/MapFilters';
import { SIDE_PANEL_WIDTH } from './SidePanel';

export function BottomBar() {
  const [lensOpen, setLensOpen] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: SIDE_PANEL_WIDTH,
        height: 40,
        zIndex: 10,
        background: '#0f1923',
        borderTop: '1px solid #1e2d3a',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
        gap: 8,
        fontFamily: 'monospace',
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
        <button
          onClick={() => setLensOpen(!lensOpen)}
          style={{
            padding: '4px 10px',
            fontFamily: 'monospace',
            fontSize: 12,
            background: lensOpen ? '#c0c8d0' : '#1e2d3a',
            color: lensOpen ? '#0f1923' : '#c0c8d0',
            border: '1px solid #2a3f50',
            cursor: 'pointer',
          }}
        >
          Lens
        </button>
      </div>
    </div>
  );
}
