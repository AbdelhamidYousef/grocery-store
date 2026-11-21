import { expect, test } from '@playwright/test';

import { api, restock, uniqueEmail } from './helpers';

// Delivery slots: the checkout picker offers the store's one-hour slots, a slot with no place left
// is disabled, and a held slot ends up on the order and its confirmation (the paid-order flow is in
// checkout.spec.ts, which now picks a slot through this same picker).
const SLUG = 'dishwasher-tabs-30';
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};

type Slots = {
  data: { days: { date: string; slots: { id: string; status: string; remaining: number }[] }[] };
};

test('a slot with no place left is disabled in the picker, and the picked slot is held', async ({
  browser,
  baseURL,
  page,
}) => {
  test.setTimeout(120_000);
  await restock(browser, baseURL, [SLUG]);

  // The last open slot of the week: nobody else's spec picks it (they take the first open one).
  await page.goto('/');
  const list = await api<Slots>(page, 'GET', '/delivery/slots', undefined, {
    'X-Postcode': '10115',
  });
  const days = list.body.data.days.filter((d) => d.slots.some((s) => s.status === 'open'));
  const lastDay = days[days.length - 1]!;
  const target = lastDay.slots.filter((s) => s.status === 'open').at(-1)!;

  const product = await api<{ data: { variants: { id: string }[] } }>(
    page,
    'GET',
    `/products/${SLUG}`,
  );
  const variantId = product.body.data.variants[0]!.id;

  // As many other guests as the slot has places each hold one (a hold counts like an order).
  const contexts = [];
  for (let i = 0; i < target.remaining; i++) {
    const context = await browser.newContext(baseURL ? { baseURL } : {});
    contexts.push(context);
    const guest = await context.newPage();
    await guest.goto('/');
    await api(guest, 'POST', '/cart/items', { variantId, quantity: 1 });
    const put = await api(
      guest,
      'PUT',
      '/cart/slot',
      { slotId: target.id },
      { 'X-Postcode': '10115' },
    );
    expect(put.status, JSON.stringify(put.body)).toBe(200);
  }

  try {
    // Our shopper: add to the basket, fill the address, open the delivery time step.
    await api(page, 'POST', '/cart/items', { variantId, quantity: 1 });
    await page.goto('/checkout?postcode=10115');
    await page.getByTestId('checkout-email').fill(uniqueEmail());
    await page.getByLabel('Full name').fill(ADDRESS.fullName);
    await page.getByLabel('Address line 1').fill(ADDRESS.line1);
    await page.getByLabel('Postal code').fill(ADDRESS.postalCode);
    await page.getByLabel('City').fill(ADDRESS.city);
    await page.getByTestId('checkout-continue-shipping').click();

    // The last day's tab shows the full slot as disabled, with its reason.
    await page.getByTestId('delivery-day-tab').last().click();
    // (Holds of an earlier run may still be counted for a few minutes, so there can be several.)
    const full = page.locator('[data-testid=delivery-slot][data-status=full]').first();
    await expect(full).toBeDisabled();
    await expect(full).toContainText('Full');

    // An open slot of the first day can be picked: the hold countdown shows and payment unlocks.
    await page.getByTestId('delivery-day-tab').first().click();
    await expect(page.getByTestId('checkout-continue-payment')).toBeDisabled();
    // (Today can be used up by earlier runs and closes hour by hour: go on to the first day with a place.)
    const open = page.locator('[data-testid=delivery-slot][data-status=open]');
    const dayTabs = page.getByTestId('delivery-day-tab');
    for (let i = 0; i < (await dayTabs.count()) && (await open.count()) === 0; i++) {
      await dayTabs.nth(i).click();
    }
    await open.first().click();
    await expect(page.getByTestId('delivery-hold')).toContainText(/Held for 1[45]:\d\d/);
    await expect(page.getByTestId('checkout-continue-payment')).toBeEnabled();
    // The server says the same: the cart carries a held slot.
    const cart = await api<{ data: { delivery: { kind: string; holdExpiresAt: string } | null } }>(
      page,
      'GET',
      '/cart',
    );
    expect(cart.body.data.delivery?.kind).toBe('slot');
  } finally {
    for (const context of contexts) await context.close();
  }
});
