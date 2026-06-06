import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';

export function NotificationPanel() {
  const notifications       = useGameStore((state) => state.notifications);
  const dismissNotification = useGameStore((state) => state.dismissNotification);
  const viewingPlayerId     = useUIStore((state) => state.viewingPlayerId);

  const visibleNotifications = notifications.filter(
    (n) => n.playerId === viewingPlayerId || n.playerId === 'global',
  );

  if (visibleNotifications.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          fontSize: 14,
          color: '#3a5a6a',
        }}
      >
        no notifications
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', overflowY: 'auto' }}>
      {visibleNotifications.map((n) => (
        <div
          key={n.id}
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid #1e2d3a',
            fontFamily: 'monospace',
            fontSize: 16,
            color: '#c0c8d0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ flex: 1, color: n.severity === 'breaking' ? '#e05050' : n.severity === 'warning' ? '#d4a84b' : '#c0c8d0' }}>{n.text}</span>
          <button
            onClick={() => dismissNotification(n.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5a7a8a',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 16,
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
