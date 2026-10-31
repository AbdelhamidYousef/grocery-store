import { expect, test } from '@playwright/test';

import { PASSWORD, register, uniqueEmail } from './helpers';

// What the shop does when something under it fails: the server is unreachable, or the session ends
// in the middle of a visit.

test('an unreachable API shows a banner that goes away by itself', async ({ page }) => {
  test.setTimeout(60_000);
  // Only the health check fails (503), exactly what a load balancer or a restarting API gives.
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ status: 503, json: { status: 'down' } }),
  );
  await page.goto('/');
  const banner = page.getByTestId('api-down-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('cannot reach the shop');

  // The server comes back: the quick 5 s poll notices without any click or reload.
  await page.unroute('**/api/v1/health');
  await expect(banner).toBeHidden({ timeout: 15_000 });
  // And the shop itself kept working the whole time.
  await expect(page.getByTestId('page-home')).toBeVisible();
});

test('an expired session sends the shopper to sign in and the cart survives it', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/products/braided-tug-rope');
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // Open the account area through the menu while the session is still good...
  await page.getByTestId('account-menu-button').click();
  await page.getByTestId('account-menu').getByRole('link', { name: 'My account' }).click();
  await expect(page).toHaveURL(/\/account$/);

  // ...then the session ends behind the page's back (its cookie is gone), without a reload. The
  // next step inside the app asks the API for the orders and gets a 401.
  await context.clearCookies({ name: 'sid' });
  await page.getByRole('link', { name: 'Orders' }).first().click();

  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders/);
  await expect(page.getByTestId('session-expired-notice')).toContainText('Your session expired');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // The notice has done its job: signing out later does not bring it back.
  await page.getByTestId('account-menu-button').click();
  await page.getByTestId('sign-out').click();
  await page.goto('/login');
  await expect(page.getByTestId('session-expired-notice')).toHaveCount(0);
});
