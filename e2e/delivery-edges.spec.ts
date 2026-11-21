import { expect, test } from '@playwright/test';

import { api, reachMinimum, restockFiller, uniqueEmail } from './helpers';

// Phase G10 edge cases the phase specs left open: an address we do not deliver to stops at the
// postcode field, and express either is offered or says why not. Nothing here depends on the time of
// day (express is open only while the store is: both answers are valid, only a silent one is not).
// "Slot full is disabled" lives in delivery-slots.spec.ts, "below the minimum" in basket-rules.spec.ts.

const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  city: 'Berlin',
};

const REASONS = [
  'Express is only offered while the store is open.',
  'All riders are out right now. Try again in a few minutes.',
];

test('an address outside the delivery areas stops at the postcode field, before any slot or payment', async ({
  browser,
  baseURL,
  page,
}) => {
  await restockFiller(browser, baseURL);
  await page.goto('/');
  await reachMinimum(page);

  await page.goto('/checkout');
  await page.getByTestId('checkout-email').fill(uniqueEmail());
  await page.getByLabel('Full name').fill(ADDRESS.fullName);
  await page.getByLabel('Address line 1').fill(ADDRESS.line1);
  await page.getByLabel('Postal code').fill('99999');
  await page.getByLabel('City').fill(ADDRESS.city);
  await page.getByTestId('checkout-continue-shipping').click();

  await expect(page.getByText("We don't deliver to 99999 yet. We cover")).toBeVisible();
  // Still on the address step: no delivery time was offered.
  await expect(page.getByTestId('delivery-slot')).toHaveCount(0);
  await expect(page.getByTestId('checkout-continue-payment')).toHaveCount(0);

  // The server refuses it too, whatever the page does.
  const placed = await api<{ error: { code: string } }>(page, 'POST', '/checkout', {
    email: uniqueEmail(),
    shippingAddress: { ...ADDRESS, postalCode: '99999', country: 'DE' },
    shippingMethodCode: 'slot',
  });
  expect(placed.status).toBe(422);
  expect(placed.body.error.code).toBe('POSTCODE_NOT_SERVED');
});

test('express is either offered or says why not, and it needs a postcode', async ({
  browser,
  baseURL,
  page,
}) => {
  await restockFiller(browser, baseURL);
  await page.goto('/');

  // Without a postcode the server names the reason, whatever the hour.
  const none = await api<{ data: { express: { available: boolean; reason?: string } } }>(
    page,
    'GET',
    '/delivery/slots',
  );
  expect(none.body.data.express.available).toBe(false);
  expect(none.body.data.express.reason).toBe('no_postcode');
  await reachMinimum(page);
  const refused = await api<{ error: { code: string; details: { reason: string } } }>(
    page,
    'PUT',
    '/cart/express',
  );
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe('EXPRESS_UNAVAILABLE');
  expect(refused.body.error.details.reason).toBe('no_postcode');

  // With a postcode, the delivery step shows the express button or the reason it is not offered.
  await page.goto('/checkout?postcode=10115');
  await page.getByTestId('checkout-email').fill(uniqueEmail());
  await page.getByLabel('Full name').fill(ADDRESS.fullName);
  await page.getByLabel('Address line 1').fill(ADDRESS.line1);
  await page.getByLabel('Postal code').fill('10115');
  await page.getByLabel('City').fill(ADDRESS.city);
  await page.getByTestId('checkout-continue-shipping').click();
  const express = page.getByTestId('delivery-express');
  await expect(express).toBeVisible();
  const text = (await express.innerText()).trim();
  if ((await express.evaluate((el) => el.tagName)) === 'BUTTON') {
    await expect(express).toContainText('30 minutes');
  } else {
    expect(REASONS, `an express reason, got "${text}"`).toContain(text);
  }
});
