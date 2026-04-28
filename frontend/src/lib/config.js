const envBackendUrl = import.meta.env.VITE_BACKEND_URL || '';
const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// In production the API lives on the same origin (/api path), so window.location.origin
// is always a safe fallback — no VITE_BACKEND_URL needed unless using a separate API domain.
const resolvedBackendUrl = (envBackendUrl || browserOrigin).replace(/\/$/, '');

if (import.meta.env.DEV) {
  console.info('[config] Backend URL:', resolvedBackendUrl);
}

export const BACKEND_URL = resolvedBackendUrl;
export const API = `${BACKEND_URL}/api`;
