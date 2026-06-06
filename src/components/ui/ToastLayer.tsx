import { useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import type { ToastMessage } from '../../store/uiStore';

export function ToastLayer() {
  const toasts       = useUIStore((state) => state.toasts);
  const dismissToast = useUIStore((state) => state.dismissToast);

  if (!document.getElementById('toast-styles')) {
    const el = document.createElement('style');
    el.id = 'toast-styles';
    el.textContent = '@keyframes toastFadeOut { 0% { opacity: 1; transform: translateY(0) } 80% { opacity: 0.8 } 100% { opacity: 0; transform: translateY(-8px) } }';
    document.head.appendChild(el);
  }

  return (
    <>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDone={() => dismissToast(toast.id)} />
      ))}
    </>
  );
}

function ToastItem({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1000);
    return () => clearTimeout(timer);
  }, []);

  const bg     = toast.variant === 'success' ? '#1e4a2a' : '#4a1e1e';
  const color  = toast.variant === 'success' ? '#80cc90' : '#cc8080';
  const border = toast.variant === 'success' ? '#2a6a3a' : '#6a2a2a';

  return (
    <div
      style={{
        position: 'fixed',
        left: toast.x + 12,
        top:  toast.y - 28,
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: '3px 10px',
        fontFamily: 'monospace',
        fontSize: 13,
        fontVariant: 'small-caps',
        letterSpacing: '0.08em',
        pointerEvents: 'none',
        zIndex: 9999,
        animation: 'toastFadeOut 1s ease-out forwards',
      }}
    >
      {toast.message}
    </div>
  );
}
