import { expect, type Page } from '@playwright/test';

// Shared by the e2e specs. Every run registers a fresh account, so tests never depend on each
// other or on leftovers from an earlier run.
export const PASSWORD = 'e2e-correct-horse-battery';

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('First name').fill('Sam');
  await page.getByLabel('Last name').fill('Rivers');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByTestId('register-submit').click();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu-button').click();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL('/');
}
