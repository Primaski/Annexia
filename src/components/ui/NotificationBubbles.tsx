import { useGameStore } from '../../store/gameStore';

export function NotificationPanel() {
  const notifications       = useGameStore((state) => state.notifications);
  const dismissNotification = useGameStore((state) => state.dismissNotification);

  if (notifications.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#3a5a6a',
        }}
      >
        no notifications
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', overflowY: 'auto' }}>
      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid #1e2d3a',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#c0c8d0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ flex: 1 }}>{n.text}</span>
          <button
            onClick={() => dismissNotification(n.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5a7a8a',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '0 0 0 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
