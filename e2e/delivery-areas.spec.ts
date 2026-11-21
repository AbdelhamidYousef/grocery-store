import { expect, test } from '@playwright/test';

import { ADMIN, api, pickSlot, reachMinimum } from './helpers';

// Delivery areas: a postcode picks the store, the store decides what is in stock, and checkout
// reserves on the store of the delivery ADDRESS. The seed sells the frozen prawns out in Mitte and
// has them in Neukölln; this spec raises Neukölln's shelf first so repeated runs never use it up.
const NEUKOELLN_STORE_ID = 'b0000000-0000-4000-8000-000000000004';
const MITTE_STORE_ID = 'b0000000-0000-4000-8000-000000000001';

test('a Neukölln postcode shows the area, unlocks the prawns, and checkout reserves there', async ({
  browser,
  page,
}) => {
  // Admin context of its own, so the shopper stays a guest.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('/');
  expect((await api(admin, 'POST', '/auth/login', ADMIN)).status).toBe(200);
  const product = await api<{ data: { variants: { id: string }[] } }>(
    admin,
    'GET',
    '/products/frozen-prawns',
  );
  const variantId = product.body.data.variants[0]!.id;
  const setStock = (storeId: string, quantity: number) =>
    api<{ data: { reserved: number; available: number } }>(
      admin,
      'PATCH',
      `/admin/inventory/${variantId}`,
      { storeId, quantity, reason: 'correction' },
    );
  expect((await setStock(NEUKOELLN_STORE_ID, 50)).status).toBe(200);
  const mitteBefore = (await setStock(MITTE_STORE_ID, 0)).body.data;

  // No postcode yet: the default store (Mitte) has none.
  await page.goto('/');
  await expect(page.getByTestId('delivery-chip')).toContainText('Enter postcode');
  await page.goto('/products/frozen-prawns');
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();

  // Enter a Neukölln postcode in the home hero: the hero names the area, the chip the postcode.
  await page.goto('/');
  await page.getByLabel('Your postcode').fill('12045');
  await page.getByRole('button', { name: 'Check delivery' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'We deliver to 12045' })).toContainText(
    'Neukölln',
  );
  await expect(page.getByTestId('delivery-chip')).toContainText('Deliver to 12045');

  // The same product is now buyable (the postcode is remembered across navigation).
  await page.goto('/products/frozen-prawns');
  await expect(page.getByTestId('delivery-chip')).toContainText('Deliver to 12045');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();

  // Checkout to a Neukölln address reserves on the Neukölln shelf, not Mitte's. (More prawns bring the
  // basket to the 15.00 minimum order.)
  await reachMinimum(page, 'frozen-prawns', '12045');
  await pickSlot(page, '12045');
  const order = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
    email: `e2e-${Date.now()}@example.test`,
    shippingAddress: {
      fullName: 'Sam Rivers',
      line1: '95 Sonnenallee',
      postalCode: '12045',
      city: 'Berlin',
      country: 'DE',
    },
    shippingMethodCode: 'slot',
  });
  expect(order.status, JSON.stringify(order.body)).toBe(200);
  expect(order.body.data.orderNumber).toMatch(/^GR-/);

  const neukoelln = (await setStock(NEUKOELLN_STORE_ID, 50)).body.data;
  expect(neukoelln.reserved).toBeGreaterThanOrEqual(1);
  const mitteAfter = (await setStock(MITTE_STORE_ID, 0)).body.data;
  expect(mitteAfter.reserved).toBe(mitteBefore.reserved);

  await adminContext.close();
});
