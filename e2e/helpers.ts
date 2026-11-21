import { expect, type Browser, type Page } from '@playwright/test';

// Shared by the e2e specs. Every run registers a fresh account, so tests never depend on each
// other or on leftovers from an earlier run.
export const PASSWORD = 'e2e-correct-horse-battery';

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('First name').fill('Sam');
  await page.getByLabel('Last name').fill('Rivers');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByTestId('register-submit').click();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu-button').click();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/de-en$/);
}

// API calls made from inside the page (`fetch`): same origin as the app, so the browser's own
// cookies and Origin header apply exactly as they do for the UI (see checkout.spec.ts for why the
// separate request client is avoided).
export async function api<T = unknown>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  // A page that is still navigating destroys the evaluation context; try again once it settles.
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.evaluate(
        async ({ method, path, body, extraHeaders }) => {
          const res = await fetch(`/api/v1${path}`, {
            method,
            credentials: 'include',
            headers: {
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
              ...extraHeaders,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          return { status: res.status, body: (await res.json().catch(() => null)) as never };
        },
        { method, path, body, extraHeaders },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (attempt >= 4 || !message.includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('load');
    }
  }
}

// Since G5 an order needs a delivery time. This holds an open slot of the postcode's store
// through the real API (`PUT /cart/slot`), exactly what the delivery step does, so an API checkout has
// something to place. Express is never used here: it depends on the time of day.
export async function pickSlot(
  page: Page,
  postcode = '10115',
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  const headers = { 'X-Postcode': postcode, ...extraHeaders };
  const list = await api<{ data: { days: { slots: { id: string; status: string }[] }[] } }>(
    page,
    'GET',
    '/delivery/slots',
    undefined,
    headers,
  );
  const open = list.body.data.days.flatMap((d) => d.slots).filter((s) => s.status === 'open');
  expect(open.length, 'an open delivery slot (run pnpm db:seed to create them)').toBeGreaterThan(0);
  // Specs run in parallel and a slot takes 8 orders: start at a random slot (the UI specs take the
  // first one) and move on when a parallel spec took the last place.
  const start = Math.floor(Math.random() * open.length);
  for (const slot of [...open.slice(start), ...open.slice(0, start)]) {
    const put = await api(page, 'PUT', '/cart/slot', { slotId: slot.id }, headers);
    if (put.status === 200) return;
  }
  throw new Error('no delivery slot could be held');
}

export const ADMIN = { email: 'admin@grocery.test', password: 'Grocery-demo-1!' };

// A run that buys seeded products uses up their stock, and the dev database keeps it between runs:
// after enough runs the add-to-cart button says "Sold out" and the spec times out. A spec that buys
// a seeded product therefore restocks it first, as the demo admin in a context of its own (the
// test's own browser session stays a guest). Safe to run in parallel: it only ever raises stock.
export async function restock(
  browser: Browser,
  baseURL: string | undefined,
  slugs: string[],
  quantity = 50,
): Promise<void> {
  const context = await browser.newContext(baseURL ? { baseURL } : {});
  try {
    const page = await context.newPage();
    await page.goto('/');
    const login = await api(page, 'POST', '/auth/login', ADMIN);
    expect(login.status, 'admin login for restock').toBe(200);
    for (const slug of slugs) {
      const product = await api<{ data: { variants: { id: string }[] } }>(
        page,
        'GET',
        `/products/${slug}`,
      );
      expect(product.status, `${slug} exists`).toBe(200);
      for (const variant of product.body.data.variants) {
        const res = await api(page, 'PATCH', `/admin/inventory/${variant.id}`, {
          quantity,
          reason: 'correction',
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
      }
    }
  } finally {
    await context.close();
  }
}

// Since G9 a basket under 15.00 of goods cannot be placed. Tops the page's cart up with `slug` (a plain,
// well-stocked pack that no spec counts stock of: bin bags at 1.49 by default) until the goods reach the minimum. Call it AFTER
// the spec's own lines are in the cart and BEFORE anything reads the cart's totals or places the order.
// `targetCents` is a higher goal for a basket a discount will cut (a 10 % code needs 16.67 to stay at 15.00).
export async function reachMinimum(
  page: Page,
  slug = 'bin-bags-20',
  postcode?: string,
  targetCents = 1500,
): Promise<void> {
  const headers: Record<string, string> = postcode ? { 'X-Postcode': postcode } : {};
  const product = await api<{ data: { variants: { id: string; priceCents: number }[] } }>(
    page,
    'GET',
    `/products/${slug}`,
    undefined,
    headers,
  );
  const variant = product.body.data.variants[0]!;
  // A signed-in shopper may pay a member price below the list price, so the gap is measured on the
  // cart's own bill after each top-up (twice is enough: the member discount is about 10 %).
  for (let round = 0; round < 4; round++) {
    const cart = await api<{ data: { pricing: { bill: { goodsCents: number } } } }>(
      page,
      'GET',
      '/cart',
      undefined,
      headers,
    );
    const gap = targetCents - cart.body.data.pricing.bill.goodsCents;
    if (gap <= 0) return;
    const added = await api(
      page,
      'POST',
      '/cart/items',
      { variantId: variant.id, quantity: Math.ceil(gap / variant.priceCents) },
      headers,
    );
    expect(added.status, JSON.stringify(added.body)).toBe(200);
  }
  throw new Error(`the cart did not reach ${targetCents} of goods`);
}

// Ships a paid order the way the shop does: every line found, the bag packed, the bag handed to the
// rider (which captures the card). The admin's status button does not offer "shipped" for an order whose
// card is only authorised. Lines sold by weight need grams: pass them by order item product name.
export async function shipThroughPacker(
  admin: Page,
  orderNumber: string,
  grams: Record<string, number> = {},
): Promise<void> {
  const detail = await api<{
    data: {
      order: { items: { id: string; productName: string; pricePerKgCents: number | null }[] };
    };
  }>(admin, 'GET', `/admin/orders/${orderNumber}`);
  for (const item of detail.body.data.order.items) {
    const body =
      item.pricePerKgCents === null
        ? { action: 'found' }
        : { action: 'weigh', grams: grams[item.productName] ?? 500 };
    const picked = await api(
      admin,
      'POST',
      `/admin/orders/${orderNumber}/items/${item.id}/pick`,
      body,
    );
    expect(picked.status, JSON.stringify(picked.body)).toBe(200);
  }
  const packed = await api(admin, 'POST', `/admin/orders/${orderNumber}/pack`);
  expect(packed.status, JSON.stringify(packed.body)).toBe(200);
  const dispatched = await api(admin, 'POST', `/admin/orders/${orderNumber}/dispatch`);
  expect(dispatched.status, JSON.stringify(dispatched.body)).toBe(200);
}

// The filler of `reachMinimum` is used by many specs at once, each adding about ten packs: give it a shelf
// big enough that two specs never take the last packs from each other (a cart line is clamped to the
// stock when it is read, which would silently shrink the basket under the minimum).
export async function restockFiller(browser: Browser, baseURL: string | undefined): Promise<void> {
  await restock(browser, baseURL, ['bin-bags-20'], 2000);
}
