// La demo non deve tornare a portare credenziali nel browser.
//
// Fino all'11/11 `LandingPage.jsx` conteneva test@farmaciaprova.it / Test1234!
// e luca@fattorino.it / Driver123!, quindi chiunque poteva leggerle nel bundle.
// Ora il pulsante chiede al server di aprire la sessione demo: qui controlliamo
// che nei sorgenti non ricompaiano ne' le password ne' le variabili d'ambiente
// che le contenevano. Il controllo sul file costruito sta in
// scripts/controlla-segreti.sh, che gira in CI dopo il build.
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
  ['VITE_DEMO_PHARMACY_PASSWORD', 'la variabile che portava la password nel bundle'],
  ['VITE_DEMO_DRIVER_PASSWORD', 'la variabile che portava la password nel bundle'],
];

describe('credenziali demo', () => {
  const file = fileSorgente(RADICE);

  it.each(VIETATI)('nessun sorgente contiene %s (%s)', (testo) => {
    const colpevoli = file.filter((f) => fs.readFileSync(f, 'utf8').includes(testo));
    expect(colpevoli.map((f) => path.relative(RADICE, f))).toEqual([]);
  });

  it('il gestore dei pulsanti demo chiama il server, non il login con la password', () => {
    const landing = fs.readFileSync(path.join(RADICE, 'pages/LandingPage.jsx'), 'utf8');
    const inizio = landing.indexOf('const handleDemoLogin');
    expect(inizio).toBeGreaterThan(-1);
    const gestore = landing.slice(inizio, landing.indexOf('toast.error', inizio));
    expect(gestore).toContain('/auth/demo');
    expect(gestore).not.toContain('/driver/login');
    expect(gestore).not.toContain('password');
  });
});
