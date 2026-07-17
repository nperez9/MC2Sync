import { type FunctionComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import { toasts, dismissToast, type ToastItem } from '../state/app-state';

const ICONS: Record<ToastItem['type'], string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

const Toast: FunctionComponent<{ toast: ToastItem }> = ({ toast }) => {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration]);

  return (
    <div
      class={`toast ${toast.type}`}
      role="alert"
      aria-live="polite"
      onClick={() => dismissToast(toast.id)}
      style={{ cursor: 'pointer' }}
    >
      <span style={{ fontWeight: 700 }}>{ICONS[toast.type]}</span>
      <span>{toast.message}</span>
    </div>
  );
};

export const ToastContainer: FunctionComponent = () => (
  <div id="toast-container" class="toast-container" aria-live="polite" aria-label="Notifications">
    {toasts.value.map((t) => (
      <Toast key={t.id} toast={t} />
    ))}
  </div>
);
