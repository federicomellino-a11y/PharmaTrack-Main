import { test, expect } from '@playwright/test';
import { mockApiResponse, pharmacyUser } from './fixtures';

/**
 * Le rotte che non appartengono alla farmacia autenticata: pagine pubbliche,
 * accesso fattorino, console super amministratore e link di tracking
 * condivisibile. Sono fuori dalla navigazione quotidiana, quindi nessuno le
 * guarda dopo un deploy: se un loro chunk non si carica restano rotte per
 * giorni senza che nessuno se ne accorga.
 */

const PUBBLICHE = [
  { path: '/', nome: 'Landing', atteso: /PharmaTrack|consegne|farmac/i },
  { path: '/register', nome: 'Registrazione', atteso: /Registr|Farmacia|Email/i },
  { path: '/forgot-password', nome: 'Password dimenticata', atteso: /Password|Email|reimpost/i },
  { path: '/driver/login', nome: 'Login fattorino', atteso: /Fattorin|Accedi|Telefono|Password/i },
  { path: '/admin/login', nome: 'Login super admin', atteso: /Accedi|Email|Password|amministratore/i },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // In questo file si prova il comportamento di chi NON ha una sessione,
  // quindi i controlli di sessione rispondono 401. Con il mock generico a 200
  // la guardia considererebbe autenticato chiunque e i test passerebbero per
  // il motivo sbagliato, a intermittenza.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (/\/(auth|driver|admin)\/me$/.test(url.pathname)) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"non autenticato"}' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiResponse(url.pathname)),
    });
  });
  await page.route('**/ws**', (route) => route.abort());
});

for (const pagina of PUBBLICHE) {
  test(`${pagina.nome}: raggiungibile senza sessione (${pagina.path})`, async ({ page }) => {
    const errori = [];
    page.on('pageerror', (err) => errori.push(err.message));

    const risposta = await page.goto(pagina.path, { waitUntil: 'domcontentloaded' });
    expect(risposta?.status(), 'la rotta deve rispondere 200').toBe(200);

    await expect(page.locator('body')).toContainText(pagina.atteso);
    await expect(page.getByText('La schermata bianca è stata intercettata')).toHaveCount(0);
    expect(errori, `errori in console: ${errori.join(' | ')}`).toEqual([]);
  });
}

test('la pagina pubblica di tracking non esplode con un token inesistente', async ({ page }) => {
  // Un cliente che apre un link vecchio non deve vedere una pagina bianca:
  // deve vedere un messaggio che gli spiega che il link non vale piu'.
  await page.route('**/api/public/tracking**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"non trovato"}' }));

  const errori = [];
  page.on('pageerror', (err) => errori.push(err.message));

  await page.goto('/t/token-inesistente-per-prova', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const testo = await page.locator('body').innerText();
  expect(testo.length, 'la pagina non deve restare vuota').toBeGreaterThan(60);
  await expect(page.getByText('La schermata bianca è stata intercettata')).toHaveCount(0);
  expect(errori, `errori in console: ${errori.join(' | ')}`).toEqual([]);
});

test('la dashboard fattorino senza sessione porta al login fattorino', async ({ page }) => {
  await page.goto('/driver', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await expect(page).toHaveURL(/\/driver\/login/);
  await expect(page.locator('body')).toContainText(/Fattorin|Accedi|Telefono/i);
});

test('la console amministratore senza sessione porta al suo login', async ({ page }) => {
  // Il mock generico risponde 200 a tutto: qui serve il 401 vero, altrimenti
  // la guardia considera autenticato chiunque e il test non prova niente.
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await expect(page).toHaveURL(/\/admin\/login/);
});

test('la sessione della farmacia non apre la dashboard fattorino', async ({ page }) => {
  // Le due sessioni vivono su cookie diversi: un utente farmacia non deve
  // poter entrare nell'area del fattorino con il proprio cookie.
  await page.addInitScript((user) => {
    window.localStorage.setItem('pt_user_cache', JSON.stringify(user));
  }, pharmacyUser);
  await page.route('**/api/driver/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"non autenticato"}' }));

  await page.goto('/driver', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await expect(page).toHaveURL(/\/driver\/login/);
});
