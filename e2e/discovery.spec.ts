import { expect, test } from '@playwright/test';

// Phase 15: reaching a product through search, the menu and the filters, by keyboard where the
// plan says so. Needs the seeded dev database. Every test starts in a fresh browser context, so a
// guest's recent searches never leak between them.

test('search "choc" with the keyboard only and open a suggestion', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('header').getByRole('combobox', { name: 'Search products' });
  await input.focus();
  await page.keyboard.type('choc');

  const listbox = page.getByRole('listbox', { name: 'Search suggestions' });
  await expect(listbox).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  // Suggestions are announced for screen readers.
  await expect(page.getByTestId('search-status')).toContainText(/product/);

  await page.keyboard.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/products\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The search is remembered (in this browser only) and offered again on an empty box.
  await page.goto('/');
  await input.fill('');
  await input.focus();
  await page.keyboard.type('pasta');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=pasta/);
  await input.focus();
  await input.fill('');
  await expect(page.getByRole('group', { name: 'Recent searches' })).toBeVisible();
  await expect(
    page.getByTestId('search-popup').getByRole('option', { name: /pasta/ }),
  ).toBeVisible();
});

test('open the mega-menu with the keyboard and follow its promo', async ({ page }) => {
  await page.goto('/');
  const button = page.getByTestId('menu-button').filter({ hasText: 'Frozen' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByTestId('menu-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /^All Frozen|^See all Frozen/ })).toBeVisible();

  // Escape closes it and returns focus to its button.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();

  // Open again, move into the panel with Tab and follow the promo tile with Enter.
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  const promo = panel.getByTestId('menu-promo');
  await promo.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/c\/frozen-meals/);
  await expect(panel).toBeHidden();
});

test('set a price range and in-stock only; a reload keeps the state', async ({ page }) => {
  await page.goto('/c/pantry');
  const filters = page.getByTestId('filters');
  const max = filters.getByRole('slider', { name: 'Maximum price' });
  const stock = filters.getByRole('switch', { name: 'In stock only' });

  await max.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/maxPrice=\d+/);
  await stock.check();
  await expect(page).toHaveURL(/inStock=true/);
  const url = page.url();
  const range = await filters.getByTestId('price-range-text').innerText();

  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(filters.getByRole('switch', { name: 'In stock only' })).toBeChecked();
  await expect(filters.getByTestId('price-range-text')).toHaveText(range);
  await expect(page.getByRole('button', { name: /^Remove filter Price/ })).toBeVisible();
});

// Edge cases: nothing wider than the viewport, and the repeated parts of the new UI stay a
// sensible size (menu panels and the suggestion list scroll inside a max height instead of
// growing past the screen).
for (const [label, size] of [
  ['phone', { width: 390, height: 844 }],
  ['laptop', { width: 1280, height: 800 }],
] as const) {
  test(`new discovery pages never overflow the viewport (${label})`, async ({ page }) => {
    await page.setViewportSize(size);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    for (const path of ['/', '/c/pantry', '/search?q=choc']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await overflow(), `${path} at ${size.width}px`).toBeLessThanOrEqual(0);
    }

    // The suggestion list is capped (it scrolls inside its own box) and fits the viewport.
    await page.goto('/');
    const input = page.getByTestId('header').getByRole('combobox', { name: 'Search products' });
    await input.focus();
    await page.keyboard.type('a');
    await page.keyboard.type('e');
    const popup = page.getByTestId('search-popup');
    await expect(popup).toBeVisible();
    const box = await popup.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(size.width);
    expect(await overflow()).toBeLessThanOrEqual(0);

    if (label === 'laptop') {
      // A menu panel stays within the viewport width and 70% of its height. The last department
      // has the longest name, so its button sits at the far end of the bar.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByTestId('menu-button').filter({ hasText: 'Personal care & baby' }).click();
      const panel = page.getByTestId('menu-panel');
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox?.width ?? 0).toBeLessThanOrEqual(size.width);
      expect(panelBox?.height ?? 0).toBeLessThanOrEqual(size.height * 0.7 + 1);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  });
}
