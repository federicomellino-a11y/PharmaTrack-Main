import { API } from './config';

const CHIAVE = 'pt_ultima_sveglia';
const INTERVALLO_MS = 10 * 60 * 1000;

/* Il backend su Render (piano free) si addormenta dopo un quarto d'ora di
   silenzio: la prima richiesta paga il risveglio, e chi apre il gestionale
   crede che sia rotto o lentissimo. Chiedere la salute appena si apre una
   pagina fa partire il risveglio mentre l'utente legge o digita le
   credenziali, invece che al click su "Accedi" o "Demo".

   Non e' un monitoraggio: parte una volta ogni dieci minuti per scheda, non
   blocca niente e non mostra errori (se il server e' spento ci pensa la
   richiesta vera a dirlo). */
export function svegliaBackend() {
  if (typeof window === 'undefined') return;

  try {
    const ultima = Number(window.sessionStorage.getItem(CHIAVE) || 0);
    if (Date.now() - ultima < INTERVALLO_MS) return;
    window.sessionStorage.setItem(CHIAVE, String(Date.now()));
  } catch {
    // Storage non disponibile (navigazione privata severa): si pinga comunque.
  }

  try {
    fetch(`${API}/health`, { cache: 'no-store' }).catch(() => null);
  } catch {
    // fetch assente o bloccata: pazienza, non e' un compito dell'app.
  }
}

export default svegliaBackend;
