import { API } from '@/lib/config';

const reported = new Set();
const MAX_REPORTS = 25;

/**
 * Segnala un errore al backend (raccolta interna, nessun servizio esterno).
 * Non deve mai bloccare l'app: ogni problema qui viene ignorato.
 */
export function reportClientError(error, context = {}) {
  try {
    const message = typeof error === 'string'
      ? error
      : (error?.message || String(error || 'Errore sconosciuto'));
    const stack = typeof error === 'string' ? '' : (error?.stack || '');
    const key = `${message}|${context.scope || ''}`;
    if (reported.has(key) || reported.size >= MAX_REPORTS) return;
    reported.add(key);

    const payload = {
      message: String(message).slice(0, 2000),
      stack: String(stack).slice(0, 4000),
      url: typeof window !== 'undefined' ? window.location.href : '',
      level: context.level || 'error',
      context: {
        ...context,
        online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        at: new Date().toISOString(),
      },
    };

    fetch(`${API}/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => null);
  } catch {
    // il reporting non deve mai rompere l'app
  }
}

export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined' || window.__ptErrorHandlers) return;
  window.__ptErrorHandlers = true;

  window.addEventListener('error', (event) => {
    reportClientError(event.error || event.message, { scope: 'window.error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason || 'Promise rejection non gestita', { scope: 'unhandledrejection' });
  });
}
