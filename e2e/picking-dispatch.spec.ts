import { expect, test, type Page } from '@playwright/test';

import { ADMIN, api, pickSlot, register, restock, uniqueEmail } from './helpers';

// Phase G8, end to end on the simulated gateway: a shopper buys a plain pack and loose bananas, the
// admin finds the bag in the packer view, picks the pack, weighs the bananas, closes the bag and hands
// it to the rider, and the shopper's tracking page says "On the way" with the (simulated) rider while
// the account order shows what was captured.

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

async function plainProduct(page: Page) {
  const tree = await api<{ data: { id: string; children: { id: string }[] }[] }>(
    page,
    'GET',
    '/categories',
  );
  const parent = tree.body.data.find((c) => c.children.length > 0);
  const categoryId = parent?.children[0]?.id ?? tree.body.data[0]!.id;
  const sku = `E2E-G8-${Date.now().toString(36)}`.toUpperCase();
  const created = await api<{ data: { variants: { id: string }[] } }>(
    page,
    'POST',
    '/admin/products',
    {
      name: `E2E rice ${sku}`,
      description: 'Created by the G8 e2e spec.',
      categoryId,
      status: 'active',
      attributes: { optionKeys: [], shelfLifeDays: 90 },
      variants: [
        {
          sku,
          name: 'Standard',
          options: {},
          priceCents: 500,
          weightGrams: 500,
          stock: 20,
          isDefault: true,
        },
      ],
      images: [],
    },
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { variantId: created.body.data.variants[0]!.id, name: `E2E rice ${sku}` };
}

test('pick, weigh, pack and dispatch: the shopper sees "On the way" and the captured total', async ({
  browser,
  baseURL,
}) => {
  await restock(browser, baseURL, ['bananas']);
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('/');
  expect((await api(admin, 'POST', '/auth/login', ADMIN)).status).toBe(200);
  const rice = await plainProduct(admin);

  const customerContext = await browser.newContext();
  const shop = await customerContext.newPage();
  const email = uniqueEmail();
  await register(shop, email);
  await expect(shop).toHaveURL(/\/account$/);

  const bananas = await api<{ data: { variants: { id: string }[] } }>(
    shop,
    'GET',
    '/products/bananas',
  );
  for (const [variantId, quantity] of [
    [rice.variantId, 2],
    [bananas.body.data.variants[0]!.id, 1],
  ] as const) {
    const added = await api(shop, 'POST', '/cart/items', { variantId, quantity });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
  }
  await pickSlot(shop);
  const methods = await api<{ data: { code: string }[] }>(
    shop,
    'GET',
    `/checkout/shipping-methods?country=${ADDRESS.country}`,
  );
  const placed = await api<{ data: { orderNumber: string } }>(shop, 'POST', '/checkout', {
    email,
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

  // The packer view: find the bag, pick the rice, weigh the bananas.
  await admin.goto(`/admin/picking?order=${number}`);
  await admin.getByLabel('Store').selectOption('mitte');
  const bag = admin.getByTestId('picking-bag');
  await expect(bag).toContainText(number);
  await expect(bag.getByRole('button', { name: 'Bag packed' })).toBeDisabled();
  await bag.getByRole('button', { name: 'Found all 2' }).click();
  await expect(bag.getByText('Picked').first()).toBeVisible();
  await bag.getByLabel('Grams on the scale').fill('940');
  await bag.getByRole('button', { name: 'Weigh' }).click();
  await expect(bag).toContainText('Every line is done.');
  await bag.getByRole('button', { name: 'Bag packed' }).click();
  await expect(bag).toContainText('Packed.');
  await bag.getByRole('button', { name: 'Hand to rider' }).click();
  // The bag leaves the list once it is with the rider.
  await expect(admin.getByTestId('picking-bag')).toHaveCount(0);

  // The captured amount is the weighed one, once.
  const mine = await api<{
    data: {
      status: string;
      capturedCents: number;
      authorizedCents: number;
      items: { productName: string; weighedGrams: number | null }[];
    };
  }>(shop, 'GET', `/account/orders/${number}`);
  expect(mine.body.data.status).toBe('shipped');
  expect(mine.body.data.items.find((i) => i.weighedGrams !== null)?.weighedGrams).toBe(940);
  expect(mine.body.data.capturedCents).toBeGreaterThan(0);
  expect(mine.body.data.capturedCents).toBeLessThanOrEqual(mine.body.data.authorizedCents);
  const again = await api(admin, 'POST', `/admin/orders/${number}/dispatch`);
  expect(again.status).toBe(200);
  const afterAgain = await api<{ data: { capturedCents: number } }>(
    shop,
    'GET',
    `/account/orders/${number}`,
  );
  expect(afterAgain.body.data.capturedCents).toBe(mine.body.data.capturedCents);

  // The shopper's tracking page: on the way, with the simulated rider.
  await shop.goto(`/track-order?number=${number}`);
  await shop.getByLabel('Email').fill(email);
  await shop.getByRole('button', { name: 'Track order' }).click();
  await expect(shop.getByTestId('track-status')).toContainText('On the way');
  await expect(shop.getByTestId('track-rider')).toContainText('is on the way');
  await expect(shop.getByTestId('track-rider')).toContainText('the rider is simulated');
  await expect(shop.getByTestId('track-steps')).toContainText('On the way');

  // The account order shows the final bill with the captured total.
  await shop.goto(`/account/orders/${number}`);
  await expect(shop.getByTestId('order-final-bill')).toContainText(
    `€${(mine.body.data.capturedCents / 100).toFixed(2)}`,
  );
  await expect(shop.getByTestId('order-item-weighed')).toContainText('Weighed: 940 g');

  await customerContext.close();
  await adminContext.close();
});
