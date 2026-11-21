import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  ADMIN,
  api,
  pickSlot,
  reachMinimum,
  register,
  restock,
  restockFiller,
  uniqueEmail,
} from './helpers';

// Phase G6, end to end on the simulated gateway (NODE_ENV=test API, fake Stripe): a short-dated pack
// and a loose-by-weight item are bought, the card is only HELD ("up to X"), the admin captures the
// weighed amount after packing, and the customer's order shows the final bill.
//
// The short-dated stock is made by the test itself (an admin stock increase dated tomorrow), so the
// spec does not depend on what the seed happened to date; bananas are a seeded weighed product.

const HOOK_HEADERS: Record<string, string> = process.env.TEST_HOOK_SECRET
  ? { 'x-test-hook-secret': process.env.TEST_HOOK_SECRET }
  : {};
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};

// "Tomorrow" in the shop's zone ("YYYY-MM-DD"): the API judges best-before dates by the Berlin day.
function berlinTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const [y = 0, m = 0, d = 0] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

async function adminSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { context, page };
}

// A food product with 5 regular packs, then 3 more that expire tomorrow (short-dated).
async function shortDatedProduct(page: Page) {
  const tree = await api<{ data: { id: string; children: { id: string }[] }[] }>(
    page,
    'GET',
    '/categories',
  );
  const parent = tree.body.data.find((c) => c.children.length > 0);
  const categoryId = parent?.children[0]?.id ?? tree.body.data[0]!.id;
  const sku = `E2E-G6-${Date.now().toString(36)}`.toUpperCase();
  const created = await api<{ data: { slug: string; variants: { id: string }[] } }>(
    page,
    'POST',
    '/admin/products',
    {
      name: `E2E yoghurt ${sku}`,
      description: 'Created by the G6 e2e spec.',
      categoryId,
      status: 'active',
      attributes: { optionKeys: [], shelfLifeDays: 6 },
      variants: [
        {
          sku,
          name: 'Standard',
          options: {},
          priceCents: 1000,
          weightGrams: 200,
          stock: 5,
          isDefault: true,
        },
      ],
      images: [],
    },
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const variantId = created.body.data.variants[0]!.id;
  const stock = await api(page, 'PATCH', `/admin/inventory/${variantId}`, {
    quantity: 8,
    reason: 'restock',
    bestBefore: berlinTomorrow(),
  });
  expect(stock.status, JSON.stringify(stock.body)).toBe(200);
  return { slug: created.body.data.slug, variantId };
}

test('buy a weighed item and a short-dated pack: held at checkout, captured after weighing, final bill in the account', async ({
  browser,
  baseURL,
}) => {
  await restock(browser, baseURL, ['bananas']);
  await restockFiller(browser, baseURL);
  const admin = await adminSession(browser);
  const yoghurt = await shortDatedProduct(admin.page);

  const customer = await browser.newContext();
  const shop = await customer.newPage();
  await register(shop, uniqueEmail());
  await expect(shop).toHaveURL(/\/account$/);

  // The product page shows the date and the offer; the offer has its own button.
  await shop.goto(`/products/${yoghurt.slug}`);
  await expect(shop.getByTestId('best-before')).toContainText('Best before at least');
  const offer = shop.getByTestId('short-dated-offer');
  await expect(offer).toContainText('3 packs');
  await expect(offer).toContainText('30 % off');
  await offer.getByTestId('add-short-dated').click();
  await expect(shop.getByTestId('toast').filter({ hasText: 'added' })).toBeVisible();

  // A loose item says what it is: about how much, per kilo, an estimate.
  await shop.goto('/products/bananas');
  await expect(shop.getByTestId('weight-line')).toContainText('about 500 g');
  await expect(shop.getByTestId('weight-line')).toContainText('/kg');
  await shop.getByTestId('add-to-cart').click();
  await expect(shop.getByTestId('toast').first()).toBeVisible();
  await reachMinimum(shop); // the 15.00 minimum order

  // The cart marks both and promises the hold.
  await shop.goto('/cart');
  await expect(shop.getByTestId('cart-line-short-dated')).toContainText('30 % off');
  await expect(shop.getByTestId('weighed-notice')).toContainText('Final price after weighing');
  await expect(shop.getByTestId('weighed-notice')).toContainText('take only what it weighs');

  // Pay (simulated card): the order is secured with a hold, and the confirmation says so.
  await pickSlot(shop);
  const methods = await api<{ data: { code: string }[] }>(
    shop,
    'GET',
    `/checkout/shipping-methods?country=${ADDRESS.country}`,
  );
  const placed = await api<{ data: { orderNumber: string } }>(shop, 'POST', '/checkout', {
    email: uniqueEmail(),
    shippingAddress: ADDRESS,
    shippingMethodCode: methods.body.data[0]!.code,
  });
  expect(placed.status, JSON.stringify(placed.body)).toBe(200);
  const number = placed.body.data.orderNumber;
  const paid = await api(
    shop,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber: number },
    HOOK_HEADERS,
  );
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);

  await shop.goto(`/checkout/confirmation/${number}`);
  await expect(shop.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid');
  await expect(shop.getByTestId('order-held')).toContainText('We hold up to');
  await expect(shop.getByTestId('order-held')).toContainText('charge what your bag weighs');

  // The admin captures: the bananas weighed 940 g in all.
  await admin.page.goto(`/admin/orders/${number}`);
  const panel = admin.page.getByTestId('admin-capture');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Bananas: grams packed').fill('940');
  await panel.getByTestId('admin-capture-now').click();
  await expect(admin.page.getByTestId('admin-captured')).toContainText('authorised');
  await expect(admin.page.getByTestId('admin-capture')).toHaveCount(0);

  // The customer's order now shows the final bill with the weighed line.
  await shop.goto(`/account/orders/${number}`);
  await expect(shop.getByTestId('order-final-bill')).toContainText('Final bill');
  await expect(shop.getByTestId('order-item-weighed')).toContainText('Weighed: 940 g');
  await expect(shop.getByTestId('order-held')).toHaveCount(0);

  await customer.close();
  await admin.context.close();
});
