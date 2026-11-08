/**
 * Contratto della migrazione da axios a react-query.
 *
 * La migrazione e' chiusa: tutte le pagine leggono gli elenchi dagli hook
 * condivisi in src/hooks/queries.js, e dopo ogni scrittura invalidano la cache.
 * Restano su axios solo i casi elencati qui sotto, ognuno per un motivo:
 * stream di messaggi, dettagli chiesti al volo, download di file e lookup
 * pubblico senza sessione. Non e' pigrizia, e' che metterli in cache
 * creerebbe due fonti di verita' per lo stesso dato.
 *
 * Questo test serve a non tornare indietro: se una pagina nuova riporta una
 * lettura di elenco su axios, o scrive senza invalidare, qui diventa rosso.
 */
/* global process */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGINE = join(process.cwd(), 'src', 'pages');
const COMPONENTI = join(process.cwd(), 'src', 'components');

// Contesti: solo il bootstrap dell'identita', che non si puo' mettere in cache
// (una sessione scaduta non deve restare buona per 30 secondi). Notifiche e
// push passano dalla api layer come tutto il resto.
const LETTURE_NEI_CONTESTI = {
  'AdminAuthContext.jsx': 'bootstrap della sessione admin (/admin/me)',
  'AuthContext.jsx': 'bootstrap della sessione farmacia (/auth/me)',
  'DriverAuthContext.jsx': 'bootstrap della sessione fattorino (/driver/me)',
};

// Migrazione finita: nelle pagine non resta NESSUNA lettura via axios, tranne
// questi due casi che non sono letture di dati dell'app.
const LETTURE_AMMESSE = {
  'PublicTracking.jsx': { chiamate: 1, perche: 'lookup pubblico con token: nessuna sessione, nessuna cache condivisa' },
  'pharmacy/Integrations.jsx': { chiamate: 1, perche: 'download di un file come blob, non e una lettura di dati' },
};

// Pagine che scrivono senza toccare la cache, e il motivo per cui va bene.
const SCRITTURE_SENZA_CACHE = {
  'ForgotPasswordPage.jsx': 'pagina pubblica, non c e nessuna cache da rinfrescare',
  'ResetPasswordPage.jsx': 'pagina pubblica',
  'LandingPage.jsx': 'login demo dalla landing, poi si cambia pagina',
  'driver/Chat.jsx': 'stream di messaggi: lo stato arriva dal websocket',
  'driver/DeliveryDetail.jsx': 'stato locale in tempo reale, nessun elenco in cache',
  'pharmacy/Dashboard.jsx': 'rinvio email di verifica e geocodifica in background, non tocca elenchi',
  'pharmacy/Settings.jsx': 'eliminazione account: si esce e la cache sparisce',
};

function fileDellePagine(cartella = PAGINE) {
  const trovati = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === '__tests__') continue;
      trovati.push(...fileDellePagine(percorso));
    } else if (voce.endsWith('.jsx')) {
      trovati.push(percorso);
    }
  }
  return trovati;
}

const pagine = fileDellePagine().map((percorso) => ({
  nome: relative(PAGINE, percorso),
  sorgente: readFileSync(percorso, 'utf8'),
}));

const conta = (testo, modello) => (testo.match(modello) || []).length;

describe('migrazione axios -> react-query', () => {
  it('nessuna pagina legge elenchi con axios fuori dai casi ammessi', () => {
    const sospette = pagine
      .map(({ nome, sorgente }) => ({ nome, letture: conta(sorgente, /axios\.get\(/g) }))
      .filter(({ nome, letture }) => {
        if (letture === 0) return false;
        const ammesso = LETTURE_AMMESSE[nome];
        return !ammesso || ammesso.chiamate !== letture;
      });

    expect(sospette, `letture con axios non previste: ${JSON.stringify(sospette, null, 2)}`).toEqual([]);
  });

  it('i casi ammessi sono ancora quelli dichiarati, non file spariti', () => {
    const nomi = new Set(pagine.map((p) => p.nome));
    for (const [nome, dettaglio] of Object.entries(LETTURE_AMMESSE)) {
      expect(nomi.has(nome), `${nome} non esiste piu: aggiorna il contratto (${dettaglio.perche})`).toBe(true);
    }
  });

  it('ogni pagina che legge dalla cache e scrive la rinfresca', () => {
    const senzaInvalidazione = pagine
      .filter(({ sorgente }) => conta(sorgente, /axios\.(post|put|patch|delete)\(/g) > 0)
      // chi legge dagli hook ha una cache da mantenere coerente
      .filter(({ sorgente }) => sorgente.includes('hooks/queries'))
      .filter(({ sorgente }) => !sorgente.includes('invalidateQueries'))
      .map(({ nome }) => nome)
      .filter((nome) => !SCRITTURE_SENZA_CACHE[nome]);

    expect(
      senzaInvalidazione,
      `queste pagine scrivono ma non rinfrescano la cache: ${senzaInvalidazione.join(', ')}`,
    ).toEqual([]);
  });

  it('le pagine che mostrano elenchi passano dagli hook condivisi', () => {
    const elenchi = ['pharmacy/Notes.jsx', 'pharmacy/Doctors.jsx', 'pharmacy/UsefulNumbers.jsx',
      'pharmacy/Customers.jsx', 'pharmacy/Drivers.jsx', 'pharmacy/Deliveries.jsx',
      'pharmacy/Shifts.jsx', 'pharmacy/Archive.jsx', 'pharmacy/Reports.jsx', 'pharmacy/Tracking.jsx'];
    for (const nome of elenchi) {
      const pagina = pagine.find((p) => p.nome === nome);
      expect(pagina, `${nome} non trovata`).toBeTruthy();
      expect(pagina.sorgente, `${nome} non usa gli hook condivisi`).toMatch(/hooks\/queries/);
    }
  });
});

describe('un solo strato legge dal server', () => {
  it('solo-api-js-legge: hooks e pagine non chiamano axios.get', () => {
    const sorgenteHook = readFileSync(join(process.cwd(), 'src', 'hooks', 'queries.js'), 'utf8');
    expect(sorgenteHook).not.toMatch(/axios\.get/);
    const sorgenteApi = readFileSync(join(process.cwd(), 'src', 'lib', 'api.js'), 'utf8');
    expect(sorgenteApi).toMatch(/axios\.get/);
  });

  it('ogni chiave ha la sua funzione di lettura', () => {
    const api = readFileSync(join(process.cwd(), 'src', 'lib', 'api.js'), 'utf8');
    for (const nome of ['statsCliente', 'statsFattorino', 'turno', 'conversazione', 'adminUtente']) {
      expect(api).toMatch(new RegExp(`chiavi = \\{[\\s\\S]*${nome}`));
      expect(api).toMatch(new RegExp(`letture = \\{[\\s\\S]*${nome}`));
    }
  });
});

describe('anche i componenti leggono dagli hook', () => {
  it('nessun componente legge con axios.get', () => {
    const conLetture = fileDelleComponenti()
      .map((percorso) => ({ nome: relative(COMPONENTI, percorso), testo: readFileSync(percorso, 'utf8') }))
      .filter(({ testo }) => /axios\.get/.test(testo))
      .map(({ nome }) => nome);
    expect(conLetture).toEqual([]);
  });

  it('i contesti che leggono sono solo quelli ammessi', () => {
    const cartella = join(process.cwd(), 'src', 'contexts');
    const trovati = readdirSync(cartella)
      .filter((voce) => voce.endsWith('.jsx') || voce.endsWith('.js'))
      .filter((voce) => /axios\.get/.test(readFileSync(join(cartella, voce), 'utf8')));
    expect(trovati.sort()).toEqual(Object.keys(LETTURE_NEI_CONTESTI).sort());
  });
});

function fileDelleComponenti(cartella = COMPONENTI) {
  const trovati = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === '__tests__') continue;
      trovati.push(...fileDelleComponenti(percorso));
    } else if (voce.endsWith('.jsx') || voce.endsWith('.js')) {
      trovati.push(percorso);
    }
  }
  return trovati;
}
