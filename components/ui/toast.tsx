'use client';

import { useCallback, useState } from 'react';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

let toastCounter = 0;

/** Einfache Toast-Verwaltung: Meldungen unten rechts, 3 s sichtbar. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastCounter;
    setToasts((current) => [...current, { id, text, kind }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`border bg-white px-4 py-2 text-sm shadow-sm ${
            toast.kind === 'ok'
              ? 'border-accent text-ink'
              : 'border-error text-error'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
