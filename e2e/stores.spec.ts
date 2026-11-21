import { expect, test, type Page } from '@playwright/test';

import { restock } from './helpers';

// Store views, slice 1: the URL prefix. (The switcher and, later, strings and currency extend
// this file.)

test('an old unprefixed product URL lands on the default store and keeps its query', async ({
  page,
}) => {
  await page.goto('/products/shower-gel-250ml?x=1#reviews');
  await expect(page).toHaveURL(/\/de-en\/products\/shower-gel-250ml\?x=1#reviews$/);
  await expect(page.getByTestId('header')).toBeVisible();
});

test('the bare root lands on the default store', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/de-en$/);
});

test('links inside a store view stay inside it and set the page language', async ({ page }) => {
  await page.goto('/de-de/c/pantry');
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE');
  await page.getByTestId('logo').click();
  await expect(page).toHaveURL(/\/de-de$/);
});

test('an unknown store code is a not-found page, not a redirect', async ({ page }) => {
  await page.goto('/xx-yy/c/pantry');
  await expect(page.getByTestId('page-not-found')).toBeVisible();
  await expect(page).toHaveURL(/\/xx-yy\/c\/pantry$/);
});

test('the admin stays un-prefixed', async ({ page }) => {
  await page.goto('/de-en/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$|\/admin$/);
});

test('the switcher keeps the page and query, and the pick is remembered for old URLs', async ({
  page,
}) => {
  await page.goto('/de-en/c/pantry?sort=price_asc');
  await expect(page.getByTestId('header')).toBeVisible();
  await page.getByTestId('store-switcher').selectOption('de-de');
  await expect(page).toHaveURL(/\/de-de\/c\/pantry\?sort=price_asc$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE');
  await expect(page.getByTestId('store-switcher')).toHaveValue('de-de');

  // Footer switcher too, and the cookie sends a bare old URL to the last pick.
  await page.getByTestId('store-switcher-footer').selectOption('de-en');
  await expect(page).toHaveURL(/\/de-en\/c\/pantry\?sort=price_asc$/);
  await page.goto('/brands');
  await expect(page).toHaveURL(/\/de-en\/brands$/);
});

test('the old multi-country prefixes land on the English view and keep the path', async ({
  page,
}) => {
  await page.goto('/uk-en/c/pantry?sort=price_asc');
  await expect(page).toHaveURL(/\/de-en\/c\/pantry\?sort=price_asc$/);
  await page.goto('/fr-fr/brands');
  await expect(page).toHaveURL(/\/de-en\/brands$/);
});

test('every store view is announced to search engines with hreflang', async ({ page }) => {
  // On the English store: the German store has its own category slugs (`vorrat`), and the
  // alternates for it still carry the canonical's slug (follow-up in the handover).
  await page.goto('/de-en/c/pantry');
  await expect(page.getByTestId('header')).toBeVisible();
  const links = page.locator('link[rel="alternate"][hreflang]');
  await expect(links).toHaveCount(3);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', '/de-en/c/pantry');
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/de-en\/c\/pantry$/,
  );
});

// ---------------------------------------------------------------------------------------------
// Store views, slice 4: language, currency, checkout and mail follow the store view.
//
// The test drives the real UI in /de-de (German words, euros) and /de-en (English words, euros), then pays through
// the fake gateway (POST /test/webhooks/simulate, same as checkout.spec) and reads the confirmation
// mails in Mailpit: the English order mail is English, the German one is German.
// ---------------------------------------------------------------------------------------------

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8026';
const PRODUCT = 'shower-gel-250ml';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, baseURL }) => {
  await restock(browser, baseURL, [PRODUCT]);
});

// Browser-side fetch (the page's own cookies and Origin), with the store view header the web client
// would send from the URL prefix.
async function api<T>(
  page: Page,
  store: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ store, method, path, body, hookSecret }) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: {
          'X-Store-View': store,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(path.startsWith('/test/') ? { 'X-Test-Hook-Secret': hookSecret } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as never };
    },
    { store, method, path, body, hookSecret: process.env.TEST_HOOK_SECRET ?? '' },
  );
}

async function mailSubject(to: string): Promise<string> {
  let subject = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const found = (await res.json()) as { messages: { Subject: string }[] };
        subject = found.messages[0]?.Subject ?? '';
        return subject !== '';
      },
      { timeout: 60_000, message: `a mail to ${to} in Mailpit` },
    )
    .toBe(true);
  return subject;
}

async function buyIn(
  page: Page,
  store: 'de-de' | 'de-en',
  email: string,
  country: string,
): Promise<string> {
  await page.goto(`/${store}/products/${PRODUCT}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  const res = await api<{ data: { orderNumber: string } }>(page, store, 'POST', '/checkout', {
    email,
    shippingAddress: {
      fullName: 'Sam Rivers',
      line1: '1 Market Street',
      postalCode: '10115',
      city: 'Berlin',
      country,
    },
    shippingMethodCode: 'standard',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const number = res.body.data.orderNumber;
  const paid = await api(page, store, 'POST', '/test/webhooks/simulate', { orderNumber: number });
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  return number;
}

test('German store: German words and euros; English store: euros, checkout, English mail', async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.STRIPE_SECRET_KEY),
    'A Stripe key is set: the simulated payment needs the fake gateway.',
  );
  const mailUp = await fetch(`${MAILPIT}/api/v1/messages`).then(
    (r) => r.ok,
    () => false,
  );
  test.skip(!mailUp, '!!! Mailpit is unreachable: the order mails cannot be checked.');

  // --- /de-de: German strings and euros ---
  await page.goto(`/de-de/products/${PRODUCT}`);
  await expect(page.getByTestId('add-to-cart')).toHaveText('In den Warenkorb');
  await expect(page.getByTestId('price-current').first()).toContainText('€');
  const deMail = `de-${Date.now()}@grocery.test`;
  const deNumber = await buyIn(page, 'de-de', deMail, 'DE');
  await page.goto(`/de-de/checkout/confirmation/${deNumber}`);
  await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('order-summary').getByTestId('order-total')).toContainText('€');
  expect(await mailSubject(deMail)).toBe(`Deine Grocery-Bestellung ${deNumber} ist bestätigt`);

  // --- switch to /de-en: English words, still euros ---
  await page.getByTestId('store-switcher').selectOption('de-en');
  await expect(page).toHaveURL(/\/de-en\//);
  await page.goto(`/de-en/products/${PRODUCT}`);
  await expect(page.getByTestId('add-to-cart')).toHaveText('Add to cart');
  await expect(page.getByTestId('price-current').first()).toContainText('€');

  // --- add to cart and look at it ---
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.goto('/de-en/cart');
  await expect(page.getByTestId('cart-line').first()).toContainText('€');

  // --- checkout through the fake gateway: the confirmation shows euros, the mail is English ---
  const enMail = `en-${Date.now()}@grocery.test`;
  const enNumber = await buyIn(page, 'de-en', enMail, 'DE');
  await page.goto(`/de-en/checkout/confirmation/${enNumber}`);
  await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
    timeout: 15_000,
  });
  const total = page.getByTestId('order-summary').getByTestId('order-total');
  await expect(total).toContainText('€');
  expect(await mailSubject(enMail)).toBe(`Your Grocery order ${enNumber} is confirmed`);

  // A French address is refused: the shop ships to Germany only.
  await page.goto(`/de-en/products/${PRODUCT}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  const wrong = await api(page, 'de-en', 'POST', '/checkout', {
    email: enMail,
    shippingAddress: {
      fullName: 'Sam Rivers',
      line1: '1 Rue du Marché',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
    },
    shippingMethodCode: 'standard',
  });
  expect(wrong.status).toBe(400);
});
