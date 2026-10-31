import { expect, test } from '@playwright/test';

import { PASSWORD, register, signOut, uniqueEmail } from './helpers';

// Needs the API on :3000 with the seeded dev database.
test('register, sign out, sign in again', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('account-menu-button')).toBeVisible();

  await signOut(page);
  await page.getByTestId('account-menu-button').click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  // A protected page sends a signed-out visitor to the login form and back after signing in.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('page-account')).toBeVisible();
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.test');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('form-error')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\/login$/);
});

test('registering with a taken email shows the error on the field', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);
  await signOut(page);
  await register(page, email);
  await expect(page.getByLabel('Email')).toHaveAccessibleDescription(
    'An account with this email already exists',
  );
});
