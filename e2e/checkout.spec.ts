import { expect, test, type Page } from '@playwright/test';

import { register, uniqueEmail } from './helpers';

// Two ways to pay, one UI:
//
// (a) REAL STRIPE: card 4242 4242 4242 4242 typed into Stripe's iframe, the webhook delivered by
//     `stripe listen --forward-to localhost:3100/api/v1/webhooks/stripe` (the e2e API port). Needs
//     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and VITE_STRIPE_PUBLISHABLE_KEY in .env; skipped,
//     loudly, without them.
// (b) SIMULATED: always on. The API runs with NODE_ENV=test (see playwright.config.ts), so
//     POST /test/webhooks/simulate exists and, with no Stripe key, a fake payment gateway answers
//     in place of Stripe. The test drives the UI through address and shipping to the payment step,
//     places the order through the same API the UI uses, pays it with the simulator, then checks
//     the confirmation page, the stock and the cart. Everything but Stripe's iframe is real.

const STRIPE_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'VITE_STRIPE_PUBLISHABLE_KEY'];
const missingKeys = STRIPE_KEYS.filter((name) => !process.env[name]);
if (missingKeys.length > 0) {
  console.warn(
    `\n!!! checkout e2e (a) REAL STRIPE flow SKIPPED: missing ${missingKeys.join(', ')} in .env.\n` +
      '!!! The simulated payment flow (b) still runs. Add the test keys and run `stripe listen`\n' +
      '!!! to enable the card 4242 test.\n',
  );
}

// API calls the test makes itself go through the page (`fetch` inside the browser): same origin as
// the app, so the browser's own cookies (cart, session, last_order) and Origin header apply exactly
// as they do for the UI. Playwright's separate request client stalls on POSTs through Vite's dev
// proxy, which a real browser does not.
async function api<T>(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as never };
    },
    { method, path, body },
  );
}

// Well stocked in the seed (stock far above what a run uses). The file runs serially so two
// checkouts never compete for the same variant's stock mid-assertion.
test.describe.configure({ mode: 'serial' });
const PRODUCT = 'bouncy-rubber-ball';

async function addToCart(page: Page, slug = PRODUCT): Promise<void> {
  await page.goto(`/products/${slug}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
}

const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Bone Street',
  postalCode: '10115',
  city: 'Berlin',
};

async function fillAddress(page: Page): Promise<void> {
  await page.getByLabel('Full name').fill(ADDRESS.fullName);
  await page.getByLabel('Address line 1').fill(ADDRESS.line1);
  await page.getByLabel('Postal code').fill(ADDRESS.postalCode);
  await page.getByLabel('City').fill(ADDRESS.city);
}

// Address and shipping steps through the UI; returns the shipping method the shopper ended up with.
async function driveToPayment(page: Page, email: string | null): Promise<string> {
  await page.goto('/checkout');
  if (email) await page.getByTestId('checkout-email').fill(email);
  await fillAddress(page);
  await page.getByTestId('checkout-continue-shipping').click();

  const options = page.getByTestId('shipping-option');
  await expect(options.first()).toBeVisible();
  const code = await options.locator('input:checked').getAttribute('value');
  expect(code).toBeTruthy();
  // The server's quote, never a client sum: the total stays unconfirmed until payment.
  await expect(page.getByTestId('checkout-summary').getByTestId('order-total')).toContainText(
    'Confirmed at payment',
  );
  await page.getByTestId('checkout-continue-payment').click();

  // Either Payments are configured in this web build (Payment Element) or the friendly state.
  await expect(
    page.getByTestId('payment-not-configured').or(page.getByTestId('payment-element')),
  ).toBeVisible();
  const steps = page.getByTestId('checkout-step');
  await expect(steps.nth(2)).toHaveAttribute('data-state', 'active');
  return code as string;
}

interface CartBody {
  data: { items: { variantId: string; quantity: number; available: number }[] };
}

async function cartOf(page: Page): Promise<CartBody['data']> {
  const res = await api<CartBody>(page, 'GET', '/cart');
  expect(res.status).toBe(200);
  return res.body.data;
}

// Places the order with the cart cookie the browser already holds, exactly what the UI's "Continue
// to payment" sends. When the web build has a Stripe key the UI already did this and the server
// answers idempotently for the same cart.
async function placeOrder(page: Page, email: string, shippingMethodCode: string): Promise<string> {
  const res = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
    email,
    shippingAddress: { ...ADDRESS, country: 'DE' },
    shippingMethodCode,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.orderNumber;
}

async function simulatePaid(page: Page, orderNumber: string): Promise<void> {
  const res = await api(page, 'POST', '/test/webhooks/simulate', { orderNumber });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

// The simulator only exists in an API started with NODE_ENV=test. A server reused from another
// session may lack it; say so loudly instead of failing with a confusing 404.
async function simulatorAvailable(page: Page): Promise<boolean> {
  await page.goto('/');
  const res = await api<{ error?: { message?: string } }>(page, 'POST', '/test/webhooks/simulate', {
    orderNumber: 'PW-2000-000000',
  });
  return res.status === 404 && res.body?.error?.message === 'Order not found';
}

test.describe('simulated payment (fake gateway + /test/webhooks/simulate)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await simulatorAvailable(page)),
      '!!! The API on this port was not started with NODE_ENV=test, so /test/webhooks/simulate is missing. Stop it and let playwright start its own.',
    );
  });

  // Each test buys its own product: two tests paying for the same variant at once would make the
  // stock arithmetic below depend on timing.
  async function payAndVerify(page: Page, email: string, product: { slug: string; name: string }) {
    const before = await cartOf(page);
    const line = before.items[0]!;

    const method = await driveToPayment(page, email);
    const orderNumber = await placeOrder(page, email, method);

    // Not paid yet: the confirmation page waits for the webhook instead of trusting the browser.
    await page.goto(`/checkout/confirmation/${orderNumber}`);
    const status = page.getByTestId('confirmation-status');
    await expect(status).toHaveAttribute('data-state', 'pending');

    // The "webhook" arrives while the page is polling: it flips to paid without a reload.
    await simulatePaid(page, orderNumber);
    await expect(status).toHaveAttribute('data-state', 'paid', { timeout: 15_000 });
    await expect(page.getByTestId('confirmation-order-number')).toHaveText(orderNumber);
    await expect(page.getByTestId('order-summary')).toContainText(product.name);
    await expect(page.getByTestId('order-summary').getByTestId('order-total')).not.toBeEmpty();

    // The cart was converted: the badge is gone and the API's cart is empty.
    await expect(page.getByTestId('cart-count')).toHaveCount(0);
    expect((await cartOf(page)).items).toEqual([]);

    // Stock went down by exactly what was bought: paying turned the reservation into a decrement
    // (a leaked reservation would show 2 fewer). `available` = quantity - reserved, read through a
    // fresh cart.
    await addToCart(page, product.slug);
    const after = (await cartOf(page)).items.find((i) => i.variantId === line.variantId);
    expect(after?.available).toBe(line.available - line.quantity);
    return orderNumber;
  }

  test('guest checkout: address, shipping, simulated payment, paid confirmation', async ({
    page,
  }) => {
    await addToCart(page, 'bouncy-rubber-ball');
    await payAndVerify(page, uniqueEmail(), {
      slug: 'bouncy-rubber-ball',
      name: 'Bouncy Rubber Ball',
    });
  });

  test('signed-in checkout pre-fills the email and ends paid', async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/account$/);
    await addToCart(page, 'braided-tug-rope');

    await page.goto('/checkout');
    await expect(page.getByTestId('checkout-email')).toHaveValue(email);
    await expect(page.getByTestId('checkout-sign-in-hint')).toHaveCount(0);
    await expect(page.getByTestId('checkout-save-address')).not.toBeChecked();

    await payAndVerify(page, email, {
      slug: 'braided-tug-rope',
      name: 'Braided Tug Rope',
    });
  });

  test('an empty cart has nothing to check out', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });

  test('validation errors stop the address step and name the fields', async ({ page }) => {
    await addToCart(page);
    await page.goto('/checkout');
    await page.getByTestId('checkout-continue-shipping').click();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Postal code')).toHaveAccessibleDescription('Required');
    await expect(page.getByTestId('shipping-option')).toHaveCount(0);
  });
});

test.describe('real Stripe (card 4242, webhook from `stripe listen`)', () => {
  test.skip(
    missingKeys.length > 0,
    `!!! REAL STRIPE FLOW SKIPPED: missing ${missingKeys.join(', ')} in .env (and run \`stripe listen\`).`,
  );

  test('pays with the 4242 test card and the confirmation shows paid', async ({ page }) => {
    test.setTimeout(120_000);
    await addToCart(page);
    await driveToPayment(page, uniqueEmail());
    await expect(page.getByTestId('payment-element')).toBeVisible();

    const frame = page.frameLocator('iframe[title="Secure payment input frame"]').first();
    await frame.getByLabel('Card number').fill('4242 4242 4242 4242');
    await frame.getByLabel(/Expiration date/).fill('12 / 34');
    await frame.getByLabel('Security code').fill('123');
    await page.getByTestId('pay-button').click();

    await expect(page).toHaveURL(/\/checkout\/confirmation\/PW-/);
    // Needs `stripe listen` running: without it the page ends in "still confirming".
    await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
      timeout: 60_000,
    });
  });
});
