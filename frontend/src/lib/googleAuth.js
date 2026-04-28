const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

let _initialized = false;
let _callback = null;
let _loadPromise = null;

function _runInitialize() {
  if (!window.google?.accounts?.id) return;
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
  if (!GOOGLE_CLIENT_ID) return Promise.resolve(false);
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve) => {
    if (window.google?.accounts?.id) {
      _runInitialize();
      return resolve(true);
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => { _runInitialize(); resolve(true); });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => { _runInitialize(); resolve(true); };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });

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

export function promptGoogleSignIn(onNotDisplayed) {
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      if (onNotDisplayed) onNotDisplayed();
    }
  });
}
