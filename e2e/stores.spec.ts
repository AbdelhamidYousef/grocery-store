import { expect, test } from '@playwright/test';

// Store views, slice 1: the URL prefix. (The switcher and, later, strings and currency extend
// this file.)

test('an old unprefixed product URL lands on the default store and keeps its query', async ({
  page,
}) => {
  await page.goto('/products/braided-tug-rope?x=1#reviews');
  await expect(page).toHaveURL(/\/eu-en\/products\/braided-tug-rope\?x=1#reviews$/);
  await expect(page.getByTestId('header')).toBeVisible();
});

test('the bare root lands on the default store', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/eu-en$/);
});

test('links inside a store view stay inside it and set the page language', async ({ page }) => {
  await page.goto('/de-de/c/dogs');
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE');
  await page.getByTestId('logo').click();
  await expect(page).toHaveURL(/\/de-de$/);
});

test('an unknown store code is a not-found page, not a redirect', async ({ page }) => {
  await page.goto('/xx-yy/c/dogs');
  await expect(page.getByTestId('page-not-found')).toBeVisible();
  await expect(page).toHaveURL(/\/xx-yy\/c\/dogs$/);
});

test('the admin stays un-prefixed', async ({ page }) => {
  await page.goto('/eu-en/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$|\/admin$/);
});

test('the switcher keeps the page and query, and the pick is remembered for old URLs', async ({
  page,
}) => {
  await page.goto('/eu-en/c/dogs?sort=price_asc');
  await expect(page.getByTestId('header')).toBeVisible();
  await page.getByTestId('store-switcher').selectOption('uk-en');
  await expect(page).toHaveURL(/\/uk-en\/c\/dogs\?sort=price_asc$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(page.getByTestId('store-switcher')).toHaveValue('uk-en');

  // Footer switcher too, and the cookie sends a bare old URL to the last pick.
  await page.getByTestId('store-switcher-footer').selectOption('fr-fr');
  await expect(page).toHaveURL(/\/fr-fr\/c\/dogs\?sort=price_asc$/);
  await page.goto('/brands');
  await expect(page).toHaveURL(/\/fr-fr\/brands$/);
});

test('every store view is announced to search engines with hreflang', async ({ page }) => {
  await page.goto('/de-de/c/dogs');
  await expect(page.getByTestId('header')).toBeVisible();
  const links = page.locator('link[rel="alternate"][hreflang]');
  await expect(links).toHaveCount(5);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', '/de-de/c/dogs');
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/eu-en\/c\/dogs$/,
  );
});
