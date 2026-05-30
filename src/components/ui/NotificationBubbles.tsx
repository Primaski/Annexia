import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';

export function NotificationBubbles() {
  const notifications = useGameStore((state) => state.notifications);
  const dismissNotification = useGameStore((state) => state.dismissNotification);
  const setRoundtableOpen = useUIStore((state) => state.setRoundtableOpen);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (notifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 48,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
      }}
    >
      {notifications.map((n) => (
        <div key={n.id} style={{ position: 'relative' }}>
          {hoveredId === n.id && (
            <div
              style={{
                position: 'absolute',
                bottom: 48,
                left: 0,
                background: '#0f1923',
                color: '#c0c8d0',
                border: '1px solid #2a3f50',
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {n.text}
            </div>
          )}
          <div
            onClick={() => {
              dismissNotification(n.id);
              if (n.id === 'roundtable_minimized') {
                setRoundtableOpen(true);
              }
            }}
            onMouseEnter={() => setHoveredId(n.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              width: 40,
              height: 40,
              background: '#e0e8f0',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
          />
        </div>
      ))}
    </div>
  );
}
