import { execFileSync } from 'node:child_process';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, api, register, restock, uniqueEmail, pickSlot } from './helpers';

// Phase 19 (loyalty and retention), end to end, on the simulated gateway (NODE_ENV=test API with
// /test/webhooks/simulate):
//   1. newsletter double opt-in through Mailpit, the welcome code, an order with it, and the
//      "first order only" refusal on the next one;
//   2. a paid order earns points ("+N" in the ledger), the next order redeems them at the checkout
//      points box and ticks the round-up checkbox;
//   3. the wishlist share link opens logged out and stops working when sharing is switched off;
//   4. a sold-out "email me when back" alert, an admin restock and the job CLI sending the mail.
//
// Mail is read from Mailpit (docker compose); without it the mail steps skip themselves, loudly.
// Every test uses its own unique address, and buys products no other spec buys (checkout.spec
// asserts exact stock numbers on its own products), so parallel specs cannot interfere.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8026';
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};

async function mailpitUp(): Promise<boolean> {
  return fetch(`${MAILPIT}/api/v1/messages`).then(
    (r) => r.ok,
    () => false,
  );
}

// The text body of the newest mail to `to` whose subject matches.
async function mailText(to: string, subject: RegExp): Promise<string> {
  let text = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const body = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const hit = body.messages.find((m) => subject.test(m.Subject));
        if (!hit) return false;
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as {
          Text: string;
        };
        text = full.Text;
        return true;
      },
      { timeout: 60_000, message: `mail to ${to} matching ${String(subject)} in Mailpit` },
    )
    .toBe(true);
  return text;
}

// Every run buys these; without a restock the dev database runs dry after a few runs.
test.beforeAll(async ({ browser, baseURL }) => {
  await restock(browser, baseURL, [
    'fabric-softener-1l',
    'toilet-paper-8',
    'laundry-liquid-1-5l',
    'dishwasher-tabs-30',
  ]);
});

async function addToCart(page: Page, slug: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
}

async function placeOrder(
  page: Page,
  email: string,
  extra: { pointsToRedeem?: number; roundUpDonation?: boolean } = {},
): Promise<string> {
  await pickSlot(page);
  const res = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
    email,
    shippingAddress: ADDRESS,
    shippingMethodCode: 'slot',
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.orderNumber;
}

async function simulatePaid(page: Page, orderNumber: string): Promise<void> {
  const res = await api(
    page,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber },
    {
      'X-Test-Hook-Secret': process.env.TEST_HOOK_SECRET ?? '',
    },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function simulatorAvailable(page: Page): Promise<boolean> {
  await page.goto('/');
  const res = await api<{ error?: { message?: string } }>(
    page,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber: 'GR-2000-000000' },
    { 'X-Test-Hook-Secret': process.env.TEST_HOOK_SECRET ?? '' },
  );
  return res.status === 404 && res.body?.error?.message === 'Order not found';
}

test.beforeEach(async ({ page }) => {
  test.skip(
    Boolean(process.env.STRIPE_SECRET_KEY),
    'A Stripe key is set: the simulator cannot pay real Stripe intents.',
  );
  test.skip(
    !(await simulatorAvailable(page)),
    '!!! This API was not started with NODE_ENV=test and this TEST_HOOK_SECRET: no payment simulator.',
  );
});

test('newsletter: confirm from the inbox, get the welcome code, use it once', async ({ page }) => {
  test.skip(
    !(await mailpitUp()),
    '!!! Mailpit is unreachable: the newsletter mail steps cannot run.',
  );
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/newsletter');
  const form = page.getByTestId('newsletter-form');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Pantry').check();
  // The consent box is a real choice: without it nothing is sent.
  await form.getByRole('button', { name: /subscribe/i }).click();
  await expect(form.getByText('Please tick the box to subscribe')).toBeVisible();
  await form.getByLabel(/Send me Grocery news/).check();
  await form.getByRole('button', { name: /subscribe/i }).click();
  await expect(page.getByTestId('newsletter-done')).toBeVisible();

  // Double opt-in: only the click in the inbox confirms. No welcome mail exists yet.
  const confirmMail = await mailText(email, /Confirm your Grocery subscription/);
  const link = confirmMail.match(/https?:\/\/\S+\/newsletter\/confirm\?token=\S+/)?.[0];
  expect(link, confirmMail).toBeTruthy();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(page.getByTestId('newsletter-confirmed')).toContainText('You are subscribed');

  const welcome = await mailText(email, /Welcome to Grocery/);
  const code = welcome.match(/WELCOME-[A-Z0-9]{4}/)?.[0];
  expect(code, welcome).toBeTruthy();
  expect(welcome).toMatch(/newsletter\/unsubscribe\?token=/);

  // First order: the code takes 10% off.
  await addToCart(page, 'fabric-softener-1l');
  await page.goto('/cart');
  await page.getByLabel('Discount code').fill(code!);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('cart-code-applied')).toContainText(code!);
  const orderNumber = await placeOrder(page, email);
  await simulatePaid(page, orderNumber);
  await page.goto(`/checkout/confirmation/${orderNumber}`);
  await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('order-summary')).toContainText('Discount');

  // Second order: the single-use code is spent (and it is a first-order code), so it is refused.
  await addToCart(page, 'toilet-paper-8');
  await page.goto('/cart');
  await page.getByLabel('Discount code').fill(code!);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/fully used|first order/i).first()).toBeVisible();
  await expect(page.getByTestId('cart-code-applied')).toHaveCount(0);
});

test('points: a paid order earns them, the next order spends some and rounds up', async ({
  page,
}) => {
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);

  // The cart promises N points; the same number lands in the ledger once the order is paid.
  await addToCart(page, 'laundry-liquid-1-5l');
  await page.goto('/cart');
  const promise = (await page.getByTestId('earn-points').first().textContent()) ?? '';
  const earned = Number(promise.match(/Earn (\d+) point/)?.[1]);
  expect(earned, promise).toBeGreaterThan(0);

  const first = await placeOrder(page, email);
  await simulatePaid(page, first);
  await page.goto('/account/rewards');
  await expect(page.getByTestId('points-balance')).toContainText(String(earned));
  await expect(page.getByTestId('points-ledger-row').first()).toContainText(`+${earned}`);

  // Next order: the shipping step offers the points box and the round-up checkbox.
  await addToCart(page, 'dishwasher-tabs-30');
  await page.goto('/checkout');
  await page.getByTestId('checkout-email').fill(email);
  await page.getByLabel('Full name').fill(ADDRESS.fullName);
  await page.getByLabel('Address line 1').fill(ADDRESS.line1);
  await page.getByLabel('Postal code').fill(ADDRESS.postalCode);
  await page.getByLabel('City').fill(ADDRESS.city);
  await page.getByTestId('checkout-continue-shipping').click();
  const box = page.getByTestId('points-redeem');
  await expect(box).toBeVisible();
  const spend = Math.min(earned, 5);
  await box.getByLabel('Use loyalty points').fill(String(spend));
  await expect(page.getByTestId('points-applied')).toContainText(`${spend} points`);
  const roundUp = page.getByTestId('round-up');
  await roundUp.check();
  await expect(roundUp).toBeChecked();

  // Place it exactly as the UI would (the card step needs Stripe's iframe).
  const second = await placeOrder(page, email, { pointsToRedeem: spend, roundUpDonation: true });
  await simulatePaid(page, second);
  await page.goto(`/checkout/confirmation/${second}`);
  await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
    timeout: 15_000,
  });
  const summary = page.getByTestId('order-summary');
  await expect(summary).toContainText('Discount');
  await page.goto('/account/rewards');
  await expect(
    page
      .getByTestId('points-ledger-row')
      .filter({ hasText: second })
      .filter({ hasText: `-${spend}` }),
  ).toHaveCount(1);
});

async function loggedOut(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test('wishlist: the share link opens logged out and dies when sharing stops', async ({
  page,
  browser,
}) => {
  await register(page, uniqueEmail());
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/products/peppermint-tea-20');
  const heart = page.getByTestId('wishlist-heart').first();
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/wishlist');
  await expect(page.getByTestId('wishlist-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Create a share link' }).click();
  const shared = (await page.getByTestId('wishlist-share-link').textContent()) ?? '';
  const path = new URL(shared.trim()).pathname;
  expect(path).toMatch(/^\/de-en\/w\//);

  const guest = await loggedOut(browser);
  await guest.page.goto(path);
  await expect(guest.page.getByTestId('page-shared-wishlist')).toContainText('Sam');
  await expect(guest.page.getByTestId('wishlist-row')).toHaveCount(1);
  await expect(guest.page.getByRole('button', { name: 'Remove' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByRole('button', { name: 'Create a share link' })).toBeVisible();
  await guest.page.reload();
  await expect(guest.page.getByText(/find that/i)).toBeVisible();
  await guest.context.close();
});

test('back in stock: alert signup, admin restock, the job CLI sends the mail', async ({ page }) => {
  test.skip(!(await mailpitUp()), '!!! Mailpit is unreachable: the alert mail cannot be checked.');
  const slug = 'spaetzle-500g'; // no other spec buys or restocks it
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status).toBe(200);
  const product = await api<{ data: { name: string; variants: { id: string }[] } }>(
    page,
    'GET',
    `/products/${slug}`,
  );
  expect(product.status).toBe(200);
  const ids = product.body.data.variants.map((v) => v.id);
  const setStock = async (quantity: number) => {
    for (const id of ids) {
      const res = await api(page, 'PATCH', `/admin/inventory/${id}`, {
        quantity,
        reason: 'correction',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
  };

  try {
    await setStock(0);
    await api(page, 'POST', '/auth/logout');
    const email = uniqueEmail();
    await page.goto(`/products/${slug}`);
    await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
    const form = page.getByTestId('stock-alert-form');
    await form.getByLabel('Email').fill(email);
    await form.getByRole('button', { name: 'Email me when back' }).click();
    await expect(page.getByTestId('stock-alert-done')).toContainText(email);

    // Nothing is sent while it is still sold out.
    execFileSync('pnpm', ['--filter', '@store/api', 'job', 'run', 'send-stock-alerts', '--force'], {
      stdio: 'pipe',
    });
    await page.waitForTimeout(500);
    const none = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    expect(((await none.json()) as { messages: unknown[] }).messages).toHaveLength(0);

    // Admin restocks (0 to above 0 marks the alert due); the job sends it.
    await api(page, 'POST', '/auth/login', ADMIN);
    await setStock(20);
    const out = execFileSync(
      'pnpm',
      ['--filter', '@store/api', 'job', 'run', 'send-stock-alerts', '--force'],
      { stdio: 'pipe' },
    ).toString();
    expect(out).toContain('"status":"ran"');
    const mail = await mailText(email, /Back in stock/);
    expect(mail).toMatch(/\/products\/spaetzle-500g\?variant=/);
    expect(mail).toMatch(/\/stock-alerts\/cancel\?token=/);
  } finally {
    await api(page, 'POST', '/auth/login', ADMIN);
    await setStock(20);
  }
});
