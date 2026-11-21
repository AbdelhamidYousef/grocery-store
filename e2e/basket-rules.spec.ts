import { expect, test, type Page } from '@playwright/test';

import { api, pickSlot, register, restock, restockFiller, uniqueEmail } from './helpers';

// Phase G9, end to end: the basket rules (minimum order, free delivery, deposit, bags) and a named
// list going into the basket. Money is the server's `basketTotals`: the page shows what it answers.

const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};

async function variantOf(page: Page, slug: string): Promise<string> {
  const res = await api<{ data: { variants: { id: string }[] } }>(page, 'GET', `/products/${slug}`);
  expect(res.status, slug).toBe(200);
  return res.body.data.variants[0]!.id;
}

async function add(page: Page, slug: string, quantity: number): Promise<void> {
  const res = await api(page, 'POST', '/cart/items', {
    variantId: await variantOf(page, slug),
    quantity,
  });
  expect(res.status, `${slug}: ${JSON.stringify(res.body)}`).toBe(200);
}

test('under the minimum order the cart says what is missing and the server refuses to place it', async ({
  browser,
  baseURL,
  page,
}) => {
  await restockFiller(browser, baseURL);
  await page.goto('/');
  await add(page, 'bin-bags-20', 2); // 2 x 1.49 = 2.98 of goods

  await page.goto('/cart');
  await expect(page.getByTestId('cart-minimum')).toContainText(
    'Add €12.02 more to check out. The minimum order is €15.00.',
  );
  await expect(page.getByTestId('cart-checkout')).toBeDisabled();

  // The button is a courtesy: the server says no too, with the same missing amount.
  await pickSlot(page);
  const placed = await api<{ error: { code: string; details: { missingCents: number } } }>(
    page,
    'POST',
    '/checkout',
    { email: uniqueEmail(), shippingAddress: ADDRESS, shippingMethodCode: 'slot' },
  );
  expect(placed.status).toBe(422);
  expect(placed.body.error.code).toBe('BELOW_MINIMUM_ORDER');
  expect(placed.body.error.details.missingCents).toBe(1202);

  // Add enough and the way to checkout opens.
  await add(page, 'bin-bags-20', 8); // 10 x 1.49 = 14.90, still short by 10 cents
  await page.reload();
  await expect(page.getByTestId('cart-minimum')).toContainText('Add €0.10 more');
  await add(page, 'bin-bags-20', 1); // 16.39
  await page.reload();
  await expect(page.getByTestId('cart-minimum')).toHaveCount(0);
  await expect(page.getByTestId('cart-checkout')).toBeEnabled();
});

test('free delivery from 49.00 of goods, the bottle deposit as its own line, and "no bags" is free', async ({
  browser,
  baseURL,
  page,
}) => {
  await restock(browser, baseURL, ['black-forest-ham', 'still-water-1-5l']);
  await page.goto('/');
  await add(page, 'still-water-1-5l', 6); // 6 x 0.39 goods, 6 x 0.25 deposit
  await add(page, 'black-forest-ham', 1); // about 24.99, a weighed estimate

  await page.goto('/cart');
  // 2.34 + 24.99 = 27.33 of goods: the free-delivery bar says what is missing; the deposit is not goods.
  await expect(page.getByTestId('cart-shipping-hint')).toContainText(
    /Add €\d+\.\d\d more for free delivery/,
  );
  await expect(page.getByTestId('cart-deposit')).toContainText('€1.50');
  await expect(page.getByTestId('cart-bags')).toContainText('Paper bags (1)');
  await expect(page.getByTestId('cart-bags')).toContainText('€0.25');
  await expect(page.getByTestId('cart-delivery-fee')).toContainText('€2.99');

  // A second ham takes the goods past 49.00: delivery is free, the deposit and the bag are not.
  await add(page, 'black-forest-ham', 1);
  await page.reload();
  await expect(page.getByTestId('cart-delivery-fee')).toContainText('Free');
  await expect(page.getByTestId('cart-shipping-hint')).toContainText('You get free delivery.');
  await expect(page.getByTestId('cart-deposit')).toContainText('€1.50');

  // "No bags, use boxes": the line says so and costs nothing; the choice is the cart's, so it survives a reload.
  const before = await page.getByTestId('cart-total-estimate').innerText();
  // The cookie notice sits over the bottom of the page: dismiss it first.
  const cookies = page.getByTestId('cookie-ok');
  if (await cookies.isVisible()) await cookies.click();
  await page.getByTestId('cart-bags-toggle').click();
  await expect(page.getByTestId('cart-bags')).toContainText('No bags, use boxes');
  await expect(page.getByTestId('cart-total-estimate')).not.toHaveText(before);
  await page.reload();
  await expect(page.getByTestId('cart-bags')).toContainText('No bags, use boxes');
});

test('a named list goes into the basket, and what the store does not have is listed', async ({
  browser,
  baseURL,
  page,
}) => {
  await restock(browser, baseURL, ['kitchen-sponges-6']);
  await restockFiller(browser, baseURL);
  await register(page, uniqueEmail());
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/account/lists');
  await page.getByLabel('New list').fill('Weekly shop');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('heading', { name: 'Weekly shop' })).toBeVisible();

  // Fill the list through the API (what the product page's "Add to list" sends), prawns are sold out in Mitte.
  const lists = await api<{ data: { id: string; name: string }[] }>(page, 'GET', '/me/lists');
  const weekly = lists.body.data.find((l) => l.name === 'Weekly shop')!;
  for (const [slug, quantity] of [
    ['bin-bags-20', 3],
    ['kitchen-sponges-6', 2],
    ['frozen-prawns', 1],
  ] as const) {
    const product = await api<{ data: { id: string; variants: { id: string }[] } }>(
      page,
      'GET',
      `/products/${slug}`,
    );
    const put = await api(page, 'PUT', `/me/lists/${weekly.id}/items`, {
      productId: product.body.data.id,
      variantId: product.body.data.variants[0]!.id,
      quantity,
    });
    expect(put.status, slug).toBe(200);
  }

  await page.reload();
  await page.getByRole('button', { name: /^Weekly shop/ }).click();
  await expect(page.getByTestId('list-items').locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add all to basket' }).click();
  const result = page.getByTestId('list-to-cart');
  await expect(result).toContainText('sold out right now');
  await expect(result).toContainText('Raw prawns');

  await page.goto('/cart');
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.filter({ hasText: 'Bin bags' }).getByRole('spinbutton')).toHaveValue('3');
  await expect(lines.filter({ hasText: 'Kitchen sponges' }).getByRole('spinbutton')).toHaveValue(
    '2',
  );
});
