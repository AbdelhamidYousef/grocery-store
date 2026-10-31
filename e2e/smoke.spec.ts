import { expect, test } from '@playwright/test';

test('home renders the header and the footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.getByTestId('footer')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});

test('an unknown url shows the not-found page inside the layout', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByTestId('page-not-found')).toBeVisible();
  await expect(page.getByTestId('header')).toBeVisible();
});

test('the skip link is the first tab stop', async ({ page }) => {
  await page.goto('/');
  // The app is client-rendered: wait for it before sending keys.
  await expect(page.getByTestId('header')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('skip-link')).toBeFocused();
});
