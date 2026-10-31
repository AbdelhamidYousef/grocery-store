import { expect, test } from '@playwright/test';

// Needs the API on :3000 with the seeded dev database (see playwright.config.ts).
test('browse: home, category, filter by material, open a product, change variant', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('pet-tiles').getByRole('link', { name: /^Dogs/ }).click();
  await expect(page).toHaveURL(/\/c\/dogs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dogs' })).toBeVisible();
  const cards = page.getByTestId('product-card');
  await expect(cards.first()).toBeVisible();
  const allDogs = await cards.count();
  expect(allDogs).toBeGreaterThan(1);

  // Filter by material: the checkbox label is "<value> (<count>)".
  await page
    .getByTestId('filters')
    .getByRole('checkbox', { name: /^Natural rubber/ })
    .check();
  await expect(page).toHaveURL(/attr\.material=natural\+rubber|attr\.material=natural%20rubber/);
  await expect(
    page.getByRole('button', { name: /Remove filter Material: Natural rubber/ }),
  ).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId('result-count')).toHaveText('1 product');

  await cards.first().click();
  await expect(page).toHaveURL(/\/products\/bouncy-rubber-ball$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bouncy Rubber Ball' })).toBeVisible();

  // Change the size: the choice is written to the URL and the price follows the variant.
  const picker = page.getByTestId('variant-picker');
  const priceBefore = await page.getByTestId('price-current').innerText();
  await expect(picker.getByRole('radio', { name: 'Small' })).toBeChecked();
  await picker.locator('label', { hasText: 'Large' }).click();
  await expect(page).toHaveURL(/\?variant=PW-[A-Z0-9-]+-L$/);
  await expect(picker.getByRole('radio', { name: 'Large' })).toBeChecked();
  await expect(page.getByTestId('price-current')).not.toHaveText(priceBefore);

  // A shared link opens the exact variant.
  const url = page.url();
  await page.goto(url);
  await expect(
    page.getByTestId('variant-picker').getByRole('radio', { name: 'Large' }),
  ).toBeChecked();
});

test('search finds a product and keeps the query in the box', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('header').getByRole('searchbox', { name: 'Search products' }).fill('rope');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=rope$/);
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(page.getByTestId('header').getByRole('searchbox')).toHaveValue('rope');
});

test('a sold-out product cannot be added to the cart', async ({ page }) => {
  await page.goto('/products/soft-glow-led-bar');
  await expect(page.getByRole('heading', { level: 1, name: 'Soft Glow LED Bar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
});

test('an unknown product shows the not-found page', async ({ page }) => {
  await page.goto('/products/does-not-exist');
  await expect(page.getByTestId('page-not-found')).toBeVisible();
});
