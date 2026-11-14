import { test, expect } from '@playwright/test';
import { mockApiResponse, pharmacyUser } from './fixtures';

/**
 * Il menu e la ricerca sono le due cose che cambiano il modo in cui si usa il
 * gestionale tutti i giorni: se il menu si chiude da solo o la ricerca non
 * trova un cliente, non se ne accorge nessun test unitario. Qui si guarda il
 * bundle vero, con le API finte.
 */

// La sessione vera la decide /auth/me, non la cache: la cache evita solo il
// redirect. Quindi le funzioni spente si fingono nella risposta del server.
const prepara = async (page, utente = pharmacyUser) => {
  await page.addInitScript((user) => {
    window.localStorage.setItem('pt_user_cache', JSON.stringify(user));
  }, utente);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const corpo = url.pathname.replace(/^\/api/, '') === '/auth/me'
      ? utente
      : mockApiResponse(url.pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    });
  });
  await page.route('**/ws**', (route) => route.abort());
};

test('menu a gruppi: le cinque sezioni, impostazioni in fondo', async ({ page }) => {
  await prepara(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pharmacy-dashboard')).toBeVisible();

  for (const gruppo of ['operativita', 'anagrafiche', 'amministrazione', 'strumenti']) {
    await expect(page.getByTestId(`nav-gruppo-${gruppo}`)).toBeVisible();
  }

  // Le impostazioni non hanno un gruppo: stanno da sole in fondo al menu.
  const impostazioni = page.getByTestId('nav-impostazioni');
  await expect(impostazioni).toBeVisible();
  const ultima = page.locator('aside nav a').last();
  await expect(ultima).toHaveAttribute('data-testid', 'nav-impostazioni');

  // Comprimere il menu toglie le scritte e lascia le icone.
  await page.getByTestId('sidebar-comprimi').click();
  await expect(page.getByTestId('nav-consegne')).toHaveAttribute('title', 'Consegne');
  await expect(page.getByTestId('nav-consegne')).not.toContainText('Consegne');
  await expect(page.getByTestId('sidebar-espandi')).toBeVisible();

  // E la scelta resta dopo un ricaricamento, invece di tornare larga.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sidebar-espandi')).toBeVisible();
});

test('vai a / cerca: trova un cliente e apre la sua scheda', async ({ page }) => {
  await prepara(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pharmacy-dashboard')).toBeVisible();

  await page.keyboard.press('Control+k');
  const casella = page.getByTestId('command-palette-input');
  await expect(casella).toBeVisible();

  await casella.fill('Anna');
  const risultato = page.getByRole('option', { name: /Anna Verdi/i }).first();
  await expect(risultato).toBeVisible();
  await risultato.click();

  // Il cliente si apre nella sua scheda, non in una pagina bianca: la pagina
  // riconosce /customers?customer=... e poi ripulisce l'indirizzo.
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByTestId('customer-detail')).toBeVisible();
});

test('vai a / cerca: una funzione spenta non compare tra le pagine', async ({ page }) => {
  const senzaMedici = { ...pharmacyUser, settings: { funzioni: { medici: false } } };
  await prepara(page, senzaMedici);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pharmacy-dashboard')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByTestId('command-palette-input').fill('medici');

  await expect(page.getByTestId('nav-medici')).toHaveCount(0);
  await expect(page.getByRole('option', { name: /Medici/i })).toHaveCount(0);
});
