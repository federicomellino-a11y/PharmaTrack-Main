import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regole di ordinamento del frontend, controllate invece che raccontate.
 *
 * Non provano una funzionalita': provano che il codice resti semplice da
 * leggere e da modificare per chi arriva dopo, persona o programma. In
 * particolare che non ricompaiano file orfani (pagina o componente che nessuno
 * monta) e che nessuna pagina torni a essere un monolite da mille righe.
 *
 * Perche' serve: il 9-10/11 quattro file sono stati trovati morti e tre
 * schermate non erano aperte da nessun test. Un file che nessuno importa non
 * da' errore, resta li' e inganna chi lo legge.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const APP = join(SRC, 'App.tsx');

const TETTO_PAGINE = 650;
const TETTO_COMPONENTI = 650;

function fileCodice(cartella, estensioni = /\.(js|jsx|ts|tsx)$/) {
  const trovati = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === '__tests__' || voce === 'node_modules') continue;
      trovati.push(...fileCodice(percorso, estensioni));
    } else if (estensioni.test(voce)) {
      trovati.push(percorso);
    }
  }
  return trovati;
}

function leggi(percorso) {
  return readFileSync(percorso, 'utf8');
}

function righe(percorso) {
  return leggi(percorso).split('\n').length;
}

/** Il nome del modulo, cioe' il file senza cartella e senza estensione. */
function modulo(percorso) {
  return percorso.split('/').pop().replace(/\.(js|jsx|ts|tsx)$/, '');
}

/** Tutti i file di src tranne i test, che citano apposta anche roba non usata. */
const FILE = fileCodice(SRC);

describe('regole del repository frontend', () => {
  it('ogni pagina di src/pages e montata in App.tsx', () => {
    // Una pagina che nessuna rotta carica non si apre da nessun indirizzo: e'
    // codice morto che sembra vivo. Se serve davvero, si monta in App.tsx.
    const app = leggi(APP);
    const orfane = FILE.filter((p) => p.includes('/pages/') && !app.includes(modulo(p))).map(
      (p) => relative(SRC, p)
    );
    expect(orfane).toEqual([]);
  });

  it('ogni componente di src/components e usato da almeno un file', () => {
    // Esclusa components/ui: sono i pezzi Shadcn, si importano per nome e non
    // hanno un chiamante diretto finche' nessuno li usa.
    const componenti = FILE.filter(
      (p) => p.includes('/components/') && !p.includes('/components/ui/')
    );
    const orfani = componenti
      .filter((componente) => {
        const nome = modulo(componente);
        return !FILE.some(
          (altro) =>
            altro !== componente &&
            new RegExp(`['"\`][^'"\`]*/${nome}['"\`]`).test(leggi(altro))
        );
      })
      .map((p) => relative(SRC, p));
    expect(orfani).toEqual([]);
  });

  it('ogni hook e ogni modulo di lib sono usati da almeno un file', () => {
    const moduli = FILE.filter((p) => p.includes('/hooks/') || p.includes('/lib/'));
    const orfani = moduli
      .filter((file) => {
        const nome = modulo(file);
        return !FILE.some(
          (altro) =>
            altro !== file && new RegExp(`['"\`][^'"\`]*/${nome}['"\`]`).test(leggi(altro))
        );
      })
      .map((p) => relative(SRC, p));
    expect(orfani).toEqual([]);
  });

  it('nessuna pagina supera le 650 righe', () => {
    // Il tetto non e' un numero magico: e' il punto oltre il quale questi file
    // sono tornati illeggibili (Deliveries era a 1.403). Se serve piu' spazio,
    // si estrae un componente o un hook, che e' quello che li ha fatti scendere.
    const troppo = FILE.filter((p) => p.includes('/pages/') && righe(p) > TETTO_PAGINE).map(
      (p) => `${relative(SRC, p)} (${righe(p)} righe)`
    );
    expect(troppo).toEqual([]);
  });

  it('nessun componente supera le 650 righe', () => {
    const troppo = FILE.filter(
      (p) => p.includes('/components/') && righe(p) > TETTO_COMPONENTI
    ).map((p) => `${relative(SRC, p)} (${righe(p)} righe)`);
    expect(troppo).toEqual([]);
  });

  it('nessuna pagina o componente lascia console.log', () => {
    // Finisce nel bundle e nei log del browser degli utenti.
    const trovati = FILE.filter((p) => /\bconsole\.log\s*\(/.test(leggi(p))).map((p) =>
      relative(SRC, p)
    );
    expect(trovati).toEqual([]);
  });
});
