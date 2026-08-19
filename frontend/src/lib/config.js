const envBackendUrl = import.meta.env.VITE_BACKEND_URL || '';
const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
import axios from 'axios';

// In production the API lives on the same origin (/api path), so window.location.origin
// is always a safe fallback — no VITE_BACKEND_URL needed unless using a separate API domain.
const resolvedBackendUrl = (envBackendUrl || browserOrigin).replace(/\/$/, '');

if (import.meta.env.DEV) {
  console.info('[config] Backend URL:', resolvedBackendUrl);
}

export const BACKEND_URL = resolvedBackendUrl;
export const API = `${BACKEND_URL}/api`;

// Coerce FastAPI validation errors (422 -> detail is an array of objects) into a
// readable string, so `err.response.data.detail` is ALWAYS safe to render in a toast.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
      error.response.data.detail = detail
        .map((d) => (typeof d === 'string' ? d : d?.msg))
        .filter(Boolean)
        .join(' · ') || 'Dati non validi';
    } else if (detail && typeof detail === 'object') {
      error.response.data.detail = detail.msg || 'Dati non validi';
    }
    return Promise.reject(error);
  }
);

