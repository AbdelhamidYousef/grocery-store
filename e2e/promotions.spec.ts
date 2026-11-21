import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, api, restock, uniqueEmail, pickSlot } from './helpers';

// Phase 18 (promotions), end to end: the gift bar, a code against a bulk tier, a flash sale
// scheduled through the admin UI (banner, sale price, Omnibus text), a paid order's promotions in
// the admin order detail, and member prices.
//
// Seeded rules this relies on: gift butter biscuits from EUR 40.00, tiers 5% from EUR 75 and
// 10% from EUR 100, code GROCERY10 (10%, min EUR 30).
//
// Independence from the other specs (they run in parallel workers on the same database):
//   - every test builds its own cart (a cart is per browser context, so nothing is shared);
//   - the only stock-moving test (checkout) buys nappies no other spec buys (restocked first);
//   - the flash sale sits on a product nobody else views or buys, has a unique name, and is ended
//     (or deleted) in `finally`; a sale left behind by a crashed run is cleaned up first.

// Grocery prices are small, so the thresholds are reached with quantities of one dearer item.
const NAPPIES = 'nappies-size-4'; // EUR 8.99, single variant
const NAPPIES_SKU = 'GR-NAPPIES-SIZE-4';
const OIL = 'olive-oil-500ml'; // EUR 6.99
const OIL_SKU = 'GR-OLIVE-OIL-500ML';
const SALE_PRODUCT = 'mixed-nuts'; // single variant, EUR 3.29
const SALE_SKU = 'GR-MIXED-NUTS';
const MEMBER_PRODUCT = 'cod-fillets'; // EUR 6.49, member price EUR 5.84
const GIFT = 'Butter biscuits';
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};
const MEMBER = { email: 'sam@grocery.test', password: 'Grocery-demo-1!' };

async function variantId(page: Page, slug: string, sku: string): Promise<string> {
  const res = await api<{ data: { variants: { id: string; sku: string }[] } }>(
    page,
    'GET',
    `/products/${slug}`,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const found = res.body.data.variants.find((v) => v.sku === sku);
  expect(found, `variant ${sku}`).toBeTruthy();
  return found!.id;
}

async function addApi(page: Page, slug: string, sku: string, quantity: number): Promise<void> {
  const id = await variantId(page, slug, sku);
  const res = await api(page, 'POST', '/cart/items', { variantId: id, quantity });
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
}

const line = (page: Page) => page.getByTestId('cart-line');

// The order test buys 12 packs of nappies (and receives a gift pack of biscuits) on every run.
test.beforeAll(async ({ browser, baseURL }) => {
  await restock(browser, baseURL, [NAPPIES, 'butter-biscuits'], 100);
});

test.describe('gift progress', () => {
  test('EUR 4.04 short of the gift, then the gift line appears', async ({ page }) => {
    // 4 x 8.99 = 35.96: 4.04 short of 40.00, 89% of the way (rounded down).
    await page.goto('/');
    await addApi(page, NAPPIES, NAPPIES_SKU, 4);
    await page.goto('/cart');
    const bar = page.getByTestId('cart-gift-progress');
    await expect(bar).toContainText('Spend €4.04 more for a free gift');
    const progress = bar.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '89');
    await expect(page.getByTestId('cart-gift-line')).toHaveCount(0);

    // + 6.99 = 42.95: over the threshold.
    await addApi(page, OIL, OIL_SKU, 1);
    await page.reload();
    await expect(bar).toContainText('You get a free gift.');
    await expect(progress).toHaveAttribute('aria-valuenow', '100');
    const gift = page.getByTestId('cart-gift-line');
    await expect(gift).toBeVisible();
    await expect(gift).toContainText('Free gift');
    await expect(gift).toContainText(GIFT);
    await expect(gift).toContainText('€0.00');
  });
});

test.describe('code against a bulk tier', () => {
  test('the better one wins and the cart says why', async ({ page }) => {
    // 11 x 8.99 = 98.89: tier 5% saves 4.94, GROCERY10 saves 9.89, so the code wins.
    await page.goto('/');
    await addApi(page, NAPPIES, NAPPIES_SKU, 11);
    await page.goto('/cart');
    await page.getByLabel('Discount code').fill('grocery10');
    await page.getByRole('button', { name: 'Apply' }).click();

    const applied = page.getByTestId('cart-code-applied');
    await expect(applied).toContainText('GROCERY10');
    const adjustments = page.getByTestId('cart-adjustment');
    await expect(adjustments).toHaveCount(1);
    await expect(adjustments.first()).toContainText('GROCERY10');
    await expect(adjustments.first()).toContainText('€9.89');
    await expect(page.getByTestId('cart-code-notice')).toHaveCount(0);

    // 12 x 8.99 = 107.88: tier 10% and GROCERY10 both save 10.79; a tie goes to the tier, which needs
    // no code, and the cart explains the choice.
    await line(page)
      .first()
      .getByRole('button', { name: /^Increase quantity/ })
      .click();
    await expect(adjustments).toHaveCount(1);
    await expect(adjustments.first()).toContainText('€10.79');
    await expect(adjustments.first()).not.toContainText('GROCERY10');
    await expect(adjustments.first()).toContainText('10%');
    await expect(page.getByTestId('cart-code-notice')).toContainText(
      /saves more than GROCERY10, so we used that/,
    );
    // The code stays on the cart: removing items later can make it the better one again.
    await expect(applied).toContainText('GROCERY10');

    const combine = page.getByTestId('cart-discounts-combine');
    await combine.getByText('How discounts combine').click();
    await expect(combine).toContainText('a bulk discount or a code, whichever saves you more');
    await expect(combine).toContainText('Never both');
  });
});

// A signed-in admin in a context of its own.
async function adminSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { context, page };
}

interface SaleRow {
  id: string;
  name: string;
  status: 'scheduled' | 'active' | 'ended';
}

// Ends a live sale (its return to the regular price is recorded by the normal end path) or deletes
// a scheduled one. Ended sales are history and stay.
async function stopSales(page: Page, match: (name: string) => boolean): Promise<void> {
  const list = await api<{ data: SaleRow[] }>(page, 'GET', '/admin/flash-sales');
  for (const sale of list.body?.data ?? []) {
    if (!match(sale.name)) continue;
    if (sale.status === 'active') await api(page, 'POST', `/admin/flash-sales/${sale.id}/end`, {});
    else if (sale.status === 'scheduled')
      await api(page, 'DELETE', `/admin/flash-sales/${sale.id}`);
  }
}

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16);

test.describe('flash sale', () => {
  test('scheduled in the admin UI: banner, sale price and the Omnibus text', async ({
    browser,
  }) => {
    const admin = await adminSession(browser);
    const name = `E2E Flash ${Date.now().toString(36)}`;
    try {
      await stopSales(admin.page, (n) => n.startsWith('E2E Flash'));

      await admin.page.goto('/admin/promotions/flash-sales');
      await admin.page.getByRole('button', { name: 'New flash sale' }).click();
      const form = admin.page.getByTestId('admin-flash-form');
      await form.getByLabel('Sale name').fill(name);
      // Starting in the past activates it on the next read; the window is minute-precise (UTC).
      await form.getByLabel('Starts (UTC)').fill(utc(Date.now() - 10 * 60_000));
      await form.getByLabel('Ends (UTC)').fill(utc(Date.now() + 2 * 3_600_000));
      await form.getByLabel('SKU, item 1').fill(SALE_SKU);
      await form.getByLabel('Sale price (EUR), item 1').fill('2.49');
      await form.getByRole('button', { name: 'Create sale' }).click();

      const row = admin.page.getByTestId('admin-flash-row').filter({ hasText: name });
      await expect(row).toBeVisible();
      await expect(row).toContainText('Live');

      // A shopper, in a fresh context (empty HTTP cache), sees it. The public catalog is cached
      // for a minute, so poll with reloads instead of sleeping.
      const shopper = await browser.newContext();
      try {
        const page = await shopper.newPage();
        await expect(async () => {
          await page.goto(`/products/${SALE_PRODUCT}`);
          await expect(page.getByTestId('sale-banner')).toContainText(name, { timeout: 2_000 });
        }).toPass({ timeout: 20_000 });
        await expect(page.getByTestId('sale-banner')).toContainText('ends in');
        await expect(page.getByTestId('sale-price').first()).toHaveText('€2.49');
        // The reference is the lowest price of the 30 days before the sale started: EUR 3.29 on a
        // fresh database, but an earlier run's own sale (EUR 2.49, now ended) is inside that
        // window on a re-run, and the Omnibus rule counts it. Both are right, so check the rule's
        // bounds rather than one number.
        const omnibus = await page.getByTestId('sale-omnibus').first().innerText();
        const reference = /^Lowest price in the last 30 days: €(\d+\.\d{2})$/.exec(omnibus);
        expect(reference, omnibus).not.toBeNull();
        const cents = Math.round(Number(reference![1]) * 100);
        expect(cents).toBeGreaterThanOrEqual(249);
        expect(cents).toBeLessThanOrEqual(329);

        // The cart charges the sale price and repeats the Omnibus line.
        await page.getByTestId('add-to-cart').click();
        await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
        await page.goto('/cart');
        await expect(page.getByTestId('cart-line-sale')).toContainText('€2.49');
        await expect(page.getByTestId('cart-line-sale')).toContainText(
          'Lowest price in the last 30 days',
        );
      } finally {
        await shopper.close();
      }

      // The live sale opens read-only in the admin, with its Omnibus reference.
      await row.getByRole('button', { name: /View/ }).click();
      await expect(admin.page.getByTestId('flash-omnibus')).toContainText(
        /Lowest 30-day price: €\d+\.\d{2}/,
      );
    } finally {
      await stopSales(admin.page, (n) => n === name);
      await admin.context.close();
    }
  });
});

test.describe('order snapshot', () => {
  test('a paid order shows what was applied in the admin order detail', async ({
    page,
    browser,
  }) => {
    // 12 packs = 107.88: the 10% tier (10.79) and the free gift. This is the one test here that
    // buys, and no other spec buys these nappies.
    await page.goto('/');
    await addApi(page, NAPPIES, NAPPIES_SKU, 12);
    const email = uniqueEmail();
    await pickSlot(page);
    const placed = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
      email,
      shippingAddress: ADDRESS,
      shippingMethodCode: 'slot',
    });
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);
    const orderNumber = placed.body.data.orderNumber;

    const paid = await api<{ error?: { message?: string } }>(
      page,
      'POST',
      '/test/webhooks/simulate',
      { orderNumber },
      { 'X-Test-Hook-Secret': process.env.TEST_HOOK_SECRET ?? '' },
    );
    test.skip(
      paid.status === 404 && paid.body?.error?.message !== 'Order not found',
      '!!! No /test/webhooks/simulate: the API was not started with NODE_ENV=test.',
    );
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);

    await page.goto(`/checkout/confirmation/${orderNumber}`);
    await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
      timeout: 15_000,
    });
    const summary = page.getByTestId('order-summary');
    await expect(summary).toContainText(GIFT);

    const admin = await adminSession(browser);
    try {
      await admin.page.goto(`/admin/orders/${orderNumber}`);
      await expect(admin.page.getByTestId('admin-order-status')).toHaveText('Paid');
      const promos = admin.page.getByTestId('admin-order-promotions');
      await expect(promos).toContainText('10%');
      await expect(promos).toContainText('€10.79');
      await expect(promos).toContainText(GIFT);
      await expect(admin.page.getByText('Discount', { exact: true })).toBeVisible();
      await expect(admin.page.getByText('-€10.79').first()).toBeVisible();
    } finally {
      await admin.context.close();
    }
  });
});

test.describe('member price', () => {
  test('a guest is teased, signs in from the link and lands back on the product', async ({
    page,
  }) => {
    await page.goto(`/products/${MEMBER_PRODUCT}`);
    const teaser = page.getByTestId('member-teaser');
    await expect(teaser).toHaveText('Member price: log in to see');
    await expect(page.getByTestId('member-price')).toHaveCount(0);
    // The number is not in the page for a guest at all.
    await expect(page.locator('body')).not.toContainText('5.84');

    await teaser.click();
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts%2F/);
    await page.getByLabel('Email').fill(MEMBER.email);
    await page.getByLabel('Password').fill(MEMBER.password);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(`/de-en/products/${MEMBER_PRODUCT}`);
    await expect(page.getByTestId('member-price')).toHaveText('Member price €5.84');
    await expect(page.getByTestId('member-teaser')).toHaveCount(0);
  });
});
