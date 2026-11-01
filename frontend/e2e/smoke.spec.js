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
  });
}

test('la pagina di login si carica senza sessione', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
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
