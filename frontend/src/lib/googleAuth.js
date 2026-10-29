import { API } from '@/lib/config';

// La chiave pubblica arriva dal backend (/api/auth/google/config): cosi' non
// serve ricostruire il frontend quando cambia il Client ID OAuth.
const STORAGE_KEY = 'pt_google_client_id';
let GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

let _initialized = false;
let _callback = null;
let _loadPromise = null;

async function fetchGoogleClientId() {
  if (GOOGLE_CLIENT_ID) return GOOGLE_CLIENT_ID;
  try {
    const cached = window.localStorage?.getItem(STORAGE_KEY);
    if (cached) {
      GOOGLE_CLIENT_ID = cached;
      return GOOGLE_CLIENT_ID;
    }
  } catch { /* storage non disponibile */ }
  try {
    const res = await fetch(`${API}/auth/google/config`);
    if (res.ok) {
      const data = await res.json();
      if (data?.client_id) {
        GOOGLE_CLIENT_ID = data.client_id;
        try { window.localStorage?.setItem(STORAGE_KEY, data.client_id); } catch { /* ignora */ }
      }
    }
  } catch { /* backend non raggiungibile */ }
  return GOOGLE_CLIENT_ID;
}

function _runInitialize() {
  if (!window.google?.accounts?.id || !GOOGLE_CLIENT_ID) return;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res) => {
      if (_callback) _callback(res.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  _initialized = true;
}

export function isGoogleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

export function loadGoogleSignIn() {
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    if (!(await fetchGoogleClientId())) return false;
    if (window.google?.accounts?.id) {
      _runInitialize();
      return true;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      return new Promise((resolve) => {
        existing.addEventListener('load', () => { _runInitialize(); resolve(true); });
        if (window.google?.accounts?.id) { _runInitialize(); resolve(true); }
      });
    }
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => { _runInitialize(); resolve(true); };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  })();

  return _loadPromise;
}

export function setGoogleCredentialCallback(cb) {
  _callback = cb;
  if (_initialized && window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res) => { if (_callback) _callback(res.credential); },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
  }
}

export function promptGoogleSignIn(onNotDisplayed, onIssue) {
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.prompt((notification) => {
    const notDisplayed = notification.isNotDisplayed?.() || false;
    const skipped = notification.isSkippedMoment?.() || false;
    if (!notDisplayed && !skipped) return;

    const reason = String(
      notification.getNotDisplayedReason?.() || notification.getSkippedMomentReason?.() || ''
    );
    if (onNotDisplayed) onNotDisplayed(reason);
    if (onIssue && /origin|client|invalid|unregistered|mismatch/i.test(reason)) onIssue(reason);
  });
}

/**
 * Google blocca il popup se l'origine corrente non è registrata sul client OAuth
 * (errore 400 origin_mismatch). Esponiamo l'origine da copiare nelle istruzioni.
 */
export function currentOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
