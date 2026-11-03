import { test, expect } from '@playwright/test';
import { mockApiResponse, pharmacyUser } from './fixtures';

/**
 * Smoke test delle pagine principali: ognuna deve mostrare il proprio
 * contenuto e non finire in pagina bianca ne' nel boundary di errore.
 */

const PAGES = [
  { path: '/dashboard', testId: 'pharmacy-dashboard', nome: 'Dashboard' },
  { path: '/deliveries', nome: 'Consegne', atteso: /Consegne|In attesa/i },
  { path: '/tracking', testId: 'tracking-page', nome: 'Tracking' },
  { path: '/customers', nome: 'Clienti', atteso: /Clienti|Cerca/i },
  { path: '/drivers', nome: 'Fattorini', atteso: /Fattorin|Aggiungi/i },
  { path: '/archive', nome: 'Archivio', atteso: /Archivio|Nessuna/i },
  // La pagina Impostazioni e' quella che ha rotto con i chunk mancanti:
  // se il suo chunk non si carica, qui si vede subito.
  { path: '/settings', nome: 'Impostazioni', atteso: /Impostazioni|Farmacia|Account/i },
  // Report ha un chunk proprio: se l'hash resta indietro, qui si vede.
  { path: '/reports', nome: 'Report', atteso: /Report|Nessun dato|Fatturato|Consegne/i },
  // Le pagine sotto hanno tutte un chunk proprio ed erano scoperte: sono
  // quelle che si rompono in silenzio dopo un deploy con hash nuovi.
  { path: '/quick', nome: 'Aggiungi consegna', atteso: /Cliente|Indirizzo|Consegna/i },
  { path: '/chat', nome: 'Messaggi', atteso: /Messaggi|Chat|Fattorin|Nessun/i },
  { path: '/shifts', nome: 'Turni', atteso: /Turni|Fattorin|Nessun/i },
  { path: '/doctors', nome: 'Medici', atteso: /Medic|Dottor|Nessun|Aggiungi/i },
  { path: '/integrations', nome: 'Integrazioni', atteso: /Integrazion|Winfarm|Bridge/i },
  { path: '/notes', nome: 'Note', atteso: /Note|Nota|Nessun/i },
  { path: '/useful-numbers', nome: 'Numeri utili', atteso: /Numeri|Chiama|Nessun/i },
  { path: '/dock', nome: 'Dock', atteso: /Dock|Cattur|Vendita|Scontrino/i },
];

test.beforeEach(async ({ page }) => {
  // Sessione gia' valida: la cache utente evita il redirect al login.
  await page.addInitScript((user) => {
    window.localStorage.setItem('pt_user_cache', JSON.stringify(user));
  }, pharmacyUser);

  // Tutte le chiamate API sono finte: nessun backend, nessun dato reale.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(url.pathname)),
    });
  });

  // Il websocket non esiste nei test: blocchiamo il tentativo invece di
  // lasciarlo in riconnessione per tutta la durata del test.
  await page.route('**/ws**', (route) => route.abort());
});

for (const pagina of PAGES) {
  test(`${pagina.nome}: si carica e mostra contenuto (${pagina.path})`, async ({ page }) => {
    const erroriPagina = [];
    page.on('pageerror', (err) => erroriPagina.push(err.message));

    const risposta = await page.goto(pagina.path, { waitUntil: 'domcontentloaded' });
    expect(risposta?.status(), 'la rotta deve rispondere 200').toBe(200);

    // Contenuto visibile: nessuna pagina bianca.
    if (pagina.testId) {
      await expect(page.getByTestId(pagina.testId)).toBeVisible();
    } else {
      await expect(page.locator('body')).toContainText(pagina.atteso);
    }

    // Non deve comparire il boundary di sicurezza ne' la rete di boot.
    await expect(page.getByText('La schermata bianca è stata intercettata')).toHaveCount(0);
    await expect(page.getByText('PharmaTrack non si è caricato')).toBeHidden();

    // Nessuna eccezione JavaScript non gestita durante il caricamento.
    expect(erroriPagina, `errori in console: ${erroriPagina.join(' | ')}`).toEqual([]);

    // Una pagina puo' montare e restare muta se un dato non arriva: sotto i
    // 120 caratteri visibili c'e' quasi sempre uno spinner o un errore.
    const testoVisibile = (await page.locator('body').innerText()).trim();
    expect(testoVisibile.length, `pagina ${pagina.path} quasi vuota`).toBeGreaterThan(120);
  });
}

test('la pagina di login si carica senza sessione', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Il beforeAll di questo file finge un utente autenticato: qui serve il
  // contrario, altrimenti la pagina di login rimanda alla dashboard e il test
  // diventa intermittente invece di verificare la pagina pubblica.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"non autenticato"}' }));
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/Accedi|Email|Password/i);
});

test('una rotta protetta senza sessione porta al login, non a una pagina bianca', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"non autenticato"}' }));

  await page.goto('/deliveries', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.locator('body')).toContainText(/Accedi|Email|Password/i);
});
