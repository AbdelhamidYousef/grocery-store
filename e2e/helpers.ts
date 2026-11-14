import { expect, type Browser, type Page } from '@playwright/test';

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
  await expect(page).toHaveURL(/\/de-en$/);
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

export const ADMIN = { email: 'admin@grocery.test', password: 'Grocery-demo-1!' };

// A run that buys seeded products uses up their stock, and the dev database keeps it between runs:
// after enough runs the add-to-cart button says "Sold out" and the spec times out. A spec that buys
// a seeded product therefore restocks it first, as the demo admin in a context of its own (the
// test's own browser session stays a guest). Safe to run in parallel: it only ever raises stock.
export async function restock(
  browser: Browser,
  baseURL: string | undefined,
  slugs: string[],
  quantity = 50,
): Promise<void> {
  const context = await browser.newContext(baseURL ? { baseURL } : {});
  try {
    const page = await context.newPage();
    await page.goto('/');
    const login = await api(page, 'POST', '/auth/login', ADMIN);
    expect(login.status, 'admin login for restock').toBe(200);
    for (const slug of slugs) {
      const product = await api<{ data: { variants: { id: string }[] } }>(
        page,
        'GET',
        `/products/${slug}`,
      );
      expect(product.status, `${slug} exists`).toBe(200);
      for (const variant of product.body.data.variants) {
        const res = await api(page, 'PATCH', `/admin/inventory/${variant.id}`, {
          quantity,
          reason: 'correction',
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
      }
    }
  } finally {
    await context.close();
  }
}
