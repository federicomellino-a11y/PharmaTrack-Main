// La demo non deve tornare.
//
// Fino all'11/11 `LandingPage.jsx` conteneva test@farmaciaprova.it / Test1234!
// e luca@fattorino.it / Driver123!, quindi chiunque poteva leggerle nel bundle.
// Dall'11 all'13/11 la sessione demo la apriva il server; il 13/11 la demo e'
// stata tolta del tutto (pulsanti, endpoint, account). Qui si controlla che nei
// sorgenti non ricompaiano ne' le credenziali ne' la rotta demo. Il bundle e'
// coperto da scripts/controlla-segreti.sh, la produzione da
// .github/scripts/verifica_produzione.py.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('..', import.meta.url));

function fileSorgente(cartella) {
  const trovati = [];
  for (const voce of fs.readdirSync(cartella, { withFileTypes: true })) {
    const percorso = path.join(cartella, voce.name);
    if (voce.isDirectory()) trovati.push(...fileSorgente(percorso));
    else if (/\.(js|jsx|ts|tsx)$/.test(voce.name) && !percorso.endsWith('demo-senza-credenziali.test.js')) trovati.push(percorso);
  }
  return trovati;
}

const VIETATI = [
  ['Test1234!', 'la vecchia password della farmacia demo'],
  ['Driver123!', 'la vecchia password del fattorino demo'],
  ['VITE_DEMO_', 'le variabili che portavano la demo nel bundle'],
  ['/auth/demo', 'la rotta della demo, rimossa il 13/11'],
];

describe('la demo non esiste piu', () => {
  const file = fileSorgente(RADICE);

  it.each(VIETATI)('nessun sorgente contiene %s (%s)', (testo) => {
    const colpevoli = file.filter((f) => fs.readFileSync(f, 'utf8').includes(testo));
    expect(colpevoli.map((f) => path.relative(RADICE, f))).toEqual([]);
  });

  it('la pagina iniziale non ha piu i pulsanti demo', () => {
    const landing = fs.readFileSync(path.join(RADICE, 'pages/LandingPage.jsx'), 'utf8');
    expect(landing).not.toContain('demo-pharmacy-btn');
    expect(landing).not.toContain('demo-driver-btn');
    expect(landing).not.toContain('Demo Farmacia');
  });
});
