import { expect, test } from '@playwright/test';

// Needs the seeded dev database: basmati rice (a food page with nutrition and specs) and the three
// seeded kits (the clean home kit is made of well-stocked household basics).

test('food page: tabs by keyboard and the tab in the URL', async ({ page }) => {
  await page.goto('/products/basmati-rice-1kg');
  const tabs = page.getByTestId('product-tabs');
  const description = tabs.getByRole('tab', { name: 'Description' });
  // A food page has a nutrition tab, right after the description.
  const nutrition = tabs.getByRole('tab', { name: 'Nutrition & ingredients' });
  await description.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nutrition).toBeFocused();
  await expect(nutrition).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#nutrition/);
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Delivery & returns' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(description).toHaveAttribute('aria-selected', 'true');
});

test('a kit: what is inside, the saving, add to cart; and the kit offer on a part', async ({
  page,
}) => {
  await page.goto('/products/clean-home-kit');
  const panel = page.getByTestId('bundle-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link')).toHaveCount(4);
  await expect(page.getByTestId('bundle-saving')).toContainText(/Save €\d+\.\d\d vs individually/);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await panel.getByRole('link', { name: /Glass cleaner/ }).click();
  await expect(page).toHaveURL(/\/products\/glass-cleaner/);
  const kits = page.getByTestId('kits-block');
  await expect(kits).toBeVisible();
  await expect(kits.getByRole('link', { name: 'Clean home kit' })).toBeVisible();
});

test('bought together: Add all puts the chosen items in the cart; delivery text; recently viewed', async ({
  page,
}) => {
  await page.goto('/products/kitchen-sponges-6');
  const block = page.getByTestId('bought-together');
  await expect(block).toBeVisible();
  const count = await block.getByTestId('bought-together-option').count();
  await block.getByTestId('bought-together-add').click();
  await expect(page.getByTestId('cart-count')).toHaveText(String(count + 1));

  // The delivery estimate: the sentence and the zone it is stated in.
  const delivery = page.getByTestId('delivery-estimate');
  await expect(delivery).toBeVisible();
  await expect(delivery).toContainText(/arrives \w{3} \d{1,2} \w{3}/);
  await expect(delivery).toContainText(/Cutoff 15:00 (CET|CEST)/);

  // Recently viewed: visit another product, come back, and the first one is in the strip.
  await page.goto('/products/glass-cleaner');
  await page.reload();
  const strip = page.getByTestId('recently-viewed');
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('link', { name: /Kitchen sponges/ }).first()).toBeVisible();
});
