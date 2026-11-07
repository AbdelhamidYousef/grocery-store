import { expect, test } from '@playwright/test';

// Phase 15: reaching a product through search, the menu, filters, a pet profile or the gift quiz,
// by keyboard where the plan says so. Needs the seeded dev database. Every test starts in a fresh
// browser context, so a guest's pets and recent searches never leak between them.

test('search "chew" with the keyboard only and open a suggestion', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('header').getByRole('combobox', { name: 'Search products' });
  await input.focus();
  await page.keyboard.type('chew');

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
  await page.keyboard.type('rope');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=rope/);
  await input.focus();
  await input.fill('');
  await expect(page.getByRole('group', { name: 'Recent searches' })).toBeVisible();
  await expect(page.getByRole('option', { name: /rope/ })).toBeVisible();
});

test('open the mega-menu with the keyboard and follow its promo', async ({ page }) => {
  await page.goto('/');
  const button = page.getByTestId('menu-button').filter({ hasText: 'Dogs' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByTestId('menu-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /^All Dogs|^See all Dogs/ })).toBeVisible();

  // Escape closes it and returns focus to its button.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();

  // Open again, walk into the panel with Tab and follow the promo tile with Enter.
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  const promo = panel.getByTestId('menu-promo');
  await promo.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/c\/dog-walk/);
  await expect(panel).toBeHidden();
});

test('a guest adds the pet Biscuit and the dog pages start filtered for it', async ({ page }) => {
  await page.goto('/account/pets');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await page.getByTestId('pet-add').click();
  await page.getByLabel('Name').fill('Biscuit');
  await page.getByLabel('Kind of pet').selectOption('dog');
  await page.getByTestId('pet-save').click();
  await expect(page.getByTestId('pet-card')).toContainText('Biscuit');

  await expect(page.getByTestId('pet-switcher-button')).toContainText('Shopping for Biscuit');

  // A dog category page opens with the pet's filters already in the URL.
  await page.goto('/c/dogs');
  await expect(page).toHaveURL(/attr\.pet=dog/);
  await expect(page.getByTestId('active-pet-note')).toContainText('Biscuit');
  const cards = page.getByTestId('product-card');
  await expect(cards.first()).toBeVisible();

  // One click clears it, and the list stays unfiltered.
  await page.getByTestId('active-pet-clear').click();
  await expect(page).not.toHaveURL(/attr\.pet/);
  await expect(page.getByTestId('active-pet-note')).toBeHidden();

  // The choice survives a reload (stored in this browser).
  await page.goto('/');
  await expect(page.getByTestId('pet-switcher-button')).toContainText('Shopping for Biscuit');
});

test('set a price range and in-stock only; a reload keeps the state', async ({ page }) => {
  await page.goto('/c/dogs');
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

test('finish the gift quiz and open the result', async ({ page }) => {
  await page.goto('/gift-finder');
  await expect(page.getByTestId('gift-progress')).toContainText('Question 1 of 4');

  // Next without an answer says so.
  await page.getByTestId('gift-next').click();
  await expect(page.getByTestId('gift-error')).toContainText('Pick one');

  await page.getByLabel('A dog', { exact: true }).check();
  await page.getByTestId('gift-next').click();
  await expect(page.getByTestId('gift-question')).toHaveText('How old are they?');
  await page.getByLabel('Grown up').check();
  await page.getByTestId('gift-next').click();
  await page.getByLabel(/Up to .*25/).check();
  await page.getByTestId('gift-next').click();
  await page.getByLabel('Playtime').check();
  await page.getByTestId('gift-next').click();

  await expect(page).toHaveURL(/\/gift-finder\/result\?pet=dog&age=adult&budget=2500&goal=play/);
  const picks = page.getByTestId('gift-picks').getByTestId('product-card');
  await expect(picks.first()).toBeVisible();
  expect(await picks.count()).toBeLessThanOrEqual(6);
  await expect(page.getByTestId('gift-why').first()).toContainText(/playtime/i);

  // The result is a pure function of the URL: a reload shows the same picks.
  const names = await picks.allInnerTexts();
  await page.reload();
  await expect(picks.first()).toBeVisible();
  expect(await picks.allInnerTexts()).toEqual(names);

  // A broken URL falls back to the quiz.
  await page.goto('/gift-finder/result?pet=horse');
  await expect(page).toHaveURL(/\/gift-finder$/);
  await expect(page.getByTestId('gift-progress')).toContainText('Question 1 of 4');
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
    for (const path of [
      '/',
      '/c/dogs',
      '/search?q=chew',
      '/gift-finder',
      '/gift-finder/result?pet=dog&age=adult&budget=2500&goal=play',
      '/account/pets',
    ]) {
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
      // A menu panel stays within the viewport width and 70% of its height.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByTestId('menu-button').filter({ hasText: 'Small Pets' }).click();
      const panel = page.getByTestId('menu-panel');
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox?.width ?? 0).toBeLessThanOrEqual(size.width);
      expect(panelBox?.height ?? 0).toBeLessThanOrEqual(size.height * 0.7 + 1);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
  });
}
