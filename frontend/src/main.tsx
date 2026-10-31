import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { installGlobalErrorHandlers } from "@/lib/errorReporter";
import { hardReload } from "@/lib/hardReload";

installGlobalErrorHandlers();

// Se un tab aperto prima di un deploy chiede un chunk non piu esistente, Vite
// emette vite:preloadError: ricarichiamo una volta sola invece di mostrare
// la schermata di errore (guardia anti-loop di 10 secondi).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event: Event) => {
    event.preventDefault();
    const key = 'pt_chunk_reload_at';
    const last = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10000) {
      window.sessionStorage.setItem(key, String(Date.now()));
      hardReload();
    }
  });
}


if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
