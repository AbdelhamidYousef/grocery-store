import { expect, test } from '@playwright/test';

import { PASSWORD, register, uniqueEmail } from './helpers';

test('profile name, password change and addresses work for a new account', async ({ page }) => {
  await register(page, uniqueEmail());
  await expect(page).toHaveURL(/\/account$/);

  // Profile: change the first name; the header shows it.
  await page.getByLabel('First name').fill('Robin');
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profile saved')).toBeVisible();

  // Security: a wrong current password is a field error and the user stays signed in.
  await page.getByRole('link', { name: 'Security' }).click();
  await page.getByLabel('Current password').fill('definitely-wrong-password');
  await page.getByLabel('New password').fill('another-long-passphrase-1');
  await page.getByTestId('password-save').click();
  await expect(page.getByLabel('Current password')).toHaveAccessibleDescription(
    'Current password is incorrect',
  );
  await expect(page.getByTestId('account-menu-button')).toBeVisible();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByTestId('password-save').click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  // Addresses: add (becomes the default), edit, add a second, move the default, delete.
  await page.getByRole('link', { name: 'Addresses' }).click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await page.getByTestId('address-add').click();
  await page.getByLabel('Full name').fill('Robin Rivers');
  await page.getByLabel('Address line 1').fill('1 Market Street');
  await page.getByLabel('Postal code').fill('10115');
  await page.getByLabel('City').fill('Berlin');
  await page.getByTestId('address-save').click();
  const cards = page.getByTestId('address-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Default shipping');

  await cards.first().getByRole('button', { name: /^Edit/ }).click();
  await page.getByLabel('City').fill('Hamburg');
  await page.getByTestId('address-save').click();
  await expect(cards.first()).toContainText('Hamburg');

  await page.getByTestId('address-add').click();
  await page.getByLabel('Full name').fill('Robin Rivers');
  await page.getByLabel('Address line 1').fill('2 Fish Road');
  await page.getByLabel('Postal code').fill('20095');
  await page.getByLabel('City').fill('Munich');
  await page.getByTestId('address-save').click();
  await expect(cards).toHaveCount(2);
  const second = cards.filter({ hasText: 'Munich' });
  await second.getByRole('button', { name: 'Make default shipping' }).click();
  await expect(second).toContainText('Default shipping');
  await expect(cards.filter({ hasText: 'Hamburg' })).not.toContainText('Default shipping');

  await cards
    .filter({ hasText: 'Hamburg' })
    .getByRole('button', { name: /^Delete/ })
    .click();
  await page.getByTestId('address-delete-confirm').click();
  await expect(cards).toHaveCount(1);

  // Orders: empty until phase 9.
  await page.getByRole('link', { name: 'Orders' }).click();
  await expect(page.getByText('You have not placed an order yet.')).toBeVisible();
});
