import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/cn';

export type ToastTone = 'info' | 'success' | 'error';

// An optional button inside the toast ("View cart"). It is a callback, not a link, because the
// provider sits above the router and cannot render a <Link>; the caller (inside the router) passes
// a function that navigates.
export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction | undefined;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

const toneClasses: Record<ToastTone, string> = {
  info: 'bg-surface text-ink border-ink',
  success: 'bg-success-soft text-success border-success',
  error: 'bg-danger-soft text-danger border-danger',
};

const AUTO_DISMISS_MS = 6000;

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    // Errors stay until dismissed: a message that vanishes before it is read fails WCAG 2.2.1.
    if (toast.tone === 'error') return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <li
      data-testid="toast"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-control border-2 p-3 shadow-card',
        toneClasses[toast.tone],
      )}
    >
      <p className="min-w-0 flex-1 break-words font-semibold">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          data-testid="toast-action"
          onClick={() => {
            toast.action?.onAction();
            onDismiss(toast.id);
          }}
          className="-my-1 min-h-11 shrink-0 rounded-control px-3 font-display font-bold underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        data-testid="toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </li>
  );
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info', action?: ToastAction) => {
    setToasts((current) => [...current, { id: nextId++, message, tone, action }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Both live regions are always in the DOM: screen readers only announce changes inside a
          region that already existed. Polite waits for a pause; errors use role=alert (assertive). */}
      <div
        aria-label="Notifications"
        role="region"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-2"
      >
        <ul role="status" aria-live="polite" className="flex flex-col gap-2">
          {toasts
            .filter((t) => t.tone !== 'error')
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </ul>
        <ul role="alert" className="flex flex-col gap-2">
          {toasts
            .filter((t) => t.tone === 'error')
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
            ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}
