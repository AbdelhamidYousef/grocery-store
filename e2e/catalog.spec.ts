import { expect, test } from '@playwright/test';

// Needs the API (started by playwright.config.ts) with the seeded dev database (see playwright.config.ts).
test('browse: home, department, dietary filter, open a product, change option', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByTestId('department-tiles')
    .getByRole('link', { name: /^Pantry/ })
    .click();
  await expect(page).toHaveURL(/\/c\/pantry$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pantry' })).toBeVisible();
  const cards = page.getByTestId('product-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(1);

  // Filter by a dietary tag: the checkbox label is "<value> (<count>)"; the choice is the `diet`
  // URL parameter and shows as a removable chip.
  await page
    .getByTestId('filters')
    .getByRole('checkbox', { name: /^Organic/ })
    .check();
  await expect(page).toHaveURL(/diet=organic/);
  await expect(page.getByRole('button', { name: /Remove filter Dietary: Organic/ })).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId('result-count')).toHaveText('1 product');

  await cards.first().click();
  await expect(page).toHaveURL(/\/products\/rolled-oats-500g$/);
  await expect(page.getByRole('heading', { level: 1, name: /Rolled oats/ })).toBeVisible();

  // Switch to the free sample: the choice is written to the URL and the price follows it.
  const picker = page.getByTestId('variant-picker');
  const priceBefore = await page.getByTestId('price-current').first().innerText();
  await expect(picker.getByRole('radio', { name: 'Full size' })).toBeChecked();
  await picker.locator('label', { hasText: 'Free sample' }).click();
  await expect(page).toHaveURL(/\?variant=GR-ROLLED-OATS-500G-TRIAL$/);
  await expect(picker.getByRole('radio', { name: 'Free sample' })).toBeChecked();
  await expect(page.getByTestId('price-current').first()).not.toHaveText(priceBefore);

  // A shared link opens the exact option.
  await page.goto(page.url());
  await expect(
    page.getByTestId('variant-picker').getByRole('radio', { name: 'Free sample' }),
  ).toBeChecked();
});

test('search finds a product and keeps the query in the box', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('header').getByRole('combobox', { name: 'Search products' }).fill('milk');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=milk$/);
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(
    page.getByTestId('header').getByRole('combobox', { name: 'Search products' }),
  ).toHaveValue('milk');
});

test('a sold-out product cannot be added to the cart', async ({ page }) => {
  await page.goto('/products/frozen-prawns');
  await expect(page.getByRole('heading', { level: 1, name: /prawns/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
});

test('an unknown product shows the not-found page', async ({ page }) => {
  await page.goto('/products/does-not-exist');
  await expect(page.getByTestId('page-not-found')).toBeVisible();
});

test('every filter group on a short desktop screen can be reached with its options', async ({
  page,
}) => {
  // 1280x800 is a common laptop. The sidebar used to be an inner scroll box that cut between a
  // heading and its checkboxes, so a group looked empty.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/c/pantry');
  const groups = page.locator('aside[aria-label="Filters"] fieldset');
  await expect(groups.first()).toBeVisible();
  const count = await groups.count();
  expect(count).toBeGreaterThan(2);
  // No ancestor of a filter group may be its own vertical scroll box: that is what clipped the
  // options away from their heading (scrollIntoView would quietly scroll the box, so checking
  // visibility alone cannot catch it).
  const clippingAncestors = await page.evaluate(() => {
    const found: string[] = [];
    document.querySelectorAll('aside[aria-label="Filters"] fieldset').forEach((group) => {
      for (let el = group.parentElement; el && el.tagName !== 'BODY'; el = el.parentElement) {
        const overflowY = getComputedStyle(el).overflowY;
        if (['auto', 'scroll', 'hidden'].includes(overflowY) && el.scrollHeight > el.clientHeight) {
          found.push(el.tagName + '.' + el.className);
        }
      }
    });
    return found;
  });
  expect(clippingAncestors).toEqual([]);
  // After scrolling the page, each heading and its first option are on screen together.
  for (let i = 0; i < count; i += 1) {
    const group = groups.nth(i);
    await group.locator('legend').scrollIntoViewIfNeeded();
    await expect(group.locator('legend')).toBeInViewport();
    await expect(group.locator('input').first()).toBeInViewport();
  }
  // No heading without options anywhere in the sidebar.
  for (let i = 0; i < count; i += 1) {
    expect(await groups.nth(i).locator('input').count()).toBeGreaterThan(0);
  }
});
