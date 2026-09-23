import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { useAppState, useWorkbench } from '../context.ts';

export function Toasts() {
  const { wb } = useWorkbench();
  const toasts = useAppState((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.kind}`}>
          {toast.kind === 'error' ? (
            <CircleX size={16} />
          ) : toast.kind === 'success' ? (
            <CircleCheck size={16} />
          ) : (
            <Info size={16} />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => wb.dismissToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
