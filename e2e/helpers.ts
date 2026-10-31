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

// API calls made from inside the page (`fetch`): same origin as the app, so the browser's own
// cookies and Origin header apply exactly as they do for the UI (see checkout.spec.ts for why the
// separate request client is avoided).
export async function api<T = unknown>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  // A page that is still navigating destroys the evaluation context; try again once it settles.
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.evaluate(
        async ({ method, path, body, extraHeaders }) => {
          const res = await fetch(`/api/v1${path}`, {
            method,
            credentials: 'include',
            headers: {
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
              ...extraHeaders,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          return { status: res.status, body: (await res.json().catch(() => null)) as never };
        },
        { method, path, body, extraHeaders },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (attempt >= 4 || !message.includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('load');
    }
  }
}

export const ADMIN = { email: 'admin@pawsome.test', password: 'Pawsome-demo-1!' };
