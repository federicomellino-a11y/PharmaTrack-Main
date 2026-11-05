import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { installGlobalErrorHandlers } from "@/lib/errorReporter";
import { hardReload } from "@/lib/hardReload";
import { toast } from 'sonner';
import { installaGestioneTelefono } from '@/lib/phoneLink';

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

  // Se l'app resta in piedi 15 secondi, il caricamento e' sano: azzeriamo la
  // guardia cosi' un guasto futuro (altro deploy) puo' ancora recuperare.
  window.setTimeout(() => {
    try { window.sessionStorage.removeItem('pt_chunk_reload_at'); } catch { /* storage non disponibile */ }
  }, 15000);
}


if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
// Se l'app parte dopo che la rete di sicurezza e comparsa, la togliamo.
const ptHideFallback = () => {
  const el = document.getElementById("boot-fallback");
  if (el) el.style.display = "none";
};
window.__ptBooted = true;
ptHideFallback();
ptHideFallback();
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Su desktop il link tel: non ha un programma a cui consegnare il numero e il
// click resta muto: qui il numero viene copiato, cosi il pulsante serve a
// qualcosa anche da computer.
installaGestioneTelefono();
window.addEventListener('pharmatrack:numero-copiato', (evento) => {
  const numero = (evento as CustomEvent<string>).detail;
  toast.success(`Numero copiato: ${numero}`);
});
