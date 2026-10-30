import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

let pending = null;
const listeners = new Set();

/** Sostituisce window.confirm con un dialogo coerente con l'app. */
export function confirmAction(options = {}) {
  return new Promise((resolve) => {
    pending = { options, resolve };
    listeners.forEach((listener) => listener(pending));
  });
}

export default function ConfirmHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    const listener = (next) => setRequest(next);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  function settle(result) {
    const current = pending;
    pending = null;
    setRequest(null);
    if (current) current.resolve(result);
  }

  useEffect(() => {
    if (!request) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') settle(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;
  const { title = 'Confermi?', description = '', confirmLabel = 'Conferma', cancelLabel = 'Annulla', destructive = false } = request.options || {};

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={() => settle(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="pt-confirm-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${destructive ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            <AlertTriangle className={`h-5 w-5 ${destructive ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <h2 id="pt-confirm-title" className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => settle(false)} className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-secondary">{cancelLabel}</button>
          <button type="button" autoFocus onClick={() => settle(true)} data-testid="confirm-dialog-accept" className={`h-10 rounded-xl px-4 text-sm font-semibold text-white ${destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
