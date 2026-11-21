import { expect, test } from '@playwright/test';

// Needs the seeded dev database (brands, "shop by need" tags, collections, free samples).
// Grocery Basics + "Breakfast" on the pantry page leaves the strawberry jam and the peanut butter;
// "Organic picks" always contains the rolled oats, which have a free sample.
const dollars = (text: string | null) => Number(/[\d.]+/.exec(text ?? '')?.[0]);

test('filter by brand and need, lowest unit price first, open a collection, one free sample', async ({
  page,
}) => {
  // 1. Brand and need filters, both kept in the URL.
  await page.goto('/c/pantry');
  const filters = page.getByTestId('filters');
  await filters.getByRole('checkbox', { name: /^Grocery Basics/ }).check();
  await expect(page).toHaveURL(/brand=grocery-basics/);
  await filters.getByRole('checkbox', { name: /^Breakfast/ }).check();
  await expect(page).toHaveURL(/tag=breakfast/);
  await expect(
    page.getByRole('button', { name: /Remove filter Brand: Grocery Basics/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Remove filter Shop by need: Breakfast/ }),
  ).toBeVisible();
  const cards = page.getByTestId('product-card');
  await expect(cards).toHaveCount(2);

  // 2. Lowest unit price first: the unit prices on the cards ascend.
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('unit_price_asc');
  await expect(page).toHaveURL(/sort=unit_price_asc/);
  const unitPrices = page.getByTestId('unit-price');
  await expect(unitPrices).toHaveCount(2);
  await expect
    .poll(async () => {
      const [a, b] = await unitPrices.allInnerTexts();
      return dollars(a ?? null) <= dollars(b ?? null);
    })
    .toBe(true);
  await expect(page.getByText(/rounded to the nearest cent/)).toBeVisible();

  // 3. A collection page lists its products and opens a product.
  await page.goto('/collections/organic-picks');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic picks' })).toBeVisible();
  await expect(cards.first()).toBeVisible();
  await cards.filter({ hasText: 'Rolled oats' }).click();
  await expect(page).toHaveURL(/\/products\/rolled-oats-500g/);

  // 4. The free sample: pick it, add it once, and the second add is refused.
  const picker = page.getByTestId('variant-picker');
  await picker.locator('label', { hasText: /^Free sample/ }).click();
  await expect(page.getByTestId('trial-pill')).toBeVisible();
  await expect(page.getByTestId('trial-note')).toContainText('one per customer');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
  await page.getByTestId('add-to-cart').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: /limited to one per customer/ }),
  ).toBeVisible();
  // Still exactly one unit in the cart.
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

test('an unknown collection or brand shows the not-found page', async ({ page }) => {
  await page.goto('/collections/does-not-exist');
  await expect(page.getByRole('heading', { name: /find that collection/ })).toBeVisible();
  await page.goto('/brands/does-not-exist');
  await expect(page.getByRole('heading', { name: /find that brand/ })).toBeVisible();
});

test('the brands page lists the house brands and opens one', async ({ page }) => {
  await page.goto('/brands');
  await expect(page.getByTestId('brand-card')).toHaveCount(8);
  await page.getByTestId('brand-card').filter({ hasText: 'Ofenfrisch' }).click();
  await expect(page).toHaveURL(/\/brands\/ofenfrisch$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ofenfrisch' })).toBeVisible();
  await expect(page.getByTestId('product-card').first()).toBeVisible();
});

test('a department is in the shop and themed with its colour', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('department-tiles')
    .getByRole('link', { name: /^Bakery/ })
    .click();
  await expect(page).toHaveURL(/\/c\/bakery$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bakery' })).toBeVisible();
  // The page wrapper carries the department, and the department's accent colour applies to it.
  const category = page.getByTestId('page-category');
  await expect(category).toHaveAttribute('data-dept', 'bakery');
  expect(
    await category.evaluate((el) => getComputedStyle(el).getPropertyValue('--dept-accent').trim()),
  ).toBe('#fbbf24');
});
