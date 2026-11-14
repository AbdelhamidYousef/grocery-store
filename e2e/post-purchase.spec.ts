import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, api, register, uniqueEmail } from './helpers';

// After the sale, end to end: a delivered order is returned, approved, received (stock back) and
// refunded (simulated payment gateway, NODE_ENV=test), a vet-approval order is held and then
// approved from the queue, and the analytics page shows non-zero figures.
//
// Payments use the same fake gateway and POST /test/webhooks/simulate as the other specs; "delivered"
// is reached through the admin's own status buttons (API), as in production.

const HOOK_HEADERS: Record<string, string> = process.env.TEST_HOOK_SECRET
  ? { 'x-test-hook-secret': process.env.TEST_HOOK_SECRET }
  : {};
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Bone Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};
const unique = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function adminSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { context, page };
}

async function createProduct(page: Page, name: string, stock = 20) {
  const tree = await api<{ data: { id: string; children: { id: string }[] }[] }>(
    page,
    'GET',
    '/categories',
  );
  const parent = tree.body.data.find((c) => c.children.length > 0);
  const categoryId = parent?.children[0]?.id ?? tree.body.data[0]!.id;
  const res = await api<{ data: { id: string; slug: string; variants: { id: string }[] } }>(
    page,
    'POST',
    '/admin/products',
    {
      name,
      description: 'Created by the post-purchase e2e spec.',
      categoryId,
      status: 'active',
      attributes: { optionKeys: [] },
      variants: [
        {
          sku: `${unique('E2E-').toUpperCase()}-1`,
          name: 'Only',
          options: {},
          priceCents: 1500,
          weightGrams: 100,
          stock,
          isDefault: true,
        },
      ],
      images: [],
    },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

async function checkout(
  page: Page,
  email: string,
  variantId: string,
  quantity: number,
  extra: object = {},
  alreadyInCart = false,
) {
  await page.goto('/');
  if (!alreadyInCart) {
    const add = await api(page, 'POST', '/cart/items', { variantId, quantity });
    expect(add.status, JSON.stringify(add.body)).toBeLessThan(300);
  }
  const shipping = await api<{ data: { code: string }[] }>(
    page,
    'GET',
    `/checkout/shipping-methods?country=${ADDRESS.country}`,
  );
  const order = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
    email,
    shippingAddress: ADDRESS,
    shippingMethodCode: shipping.body.data[0]!.code,
    ...extra,
  });
  expect(order.status, JSON.stringify(order.body)).toBe(200);
  const number = order.body.data.orderNumber;
  const paid = await api(
    page,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber: number },
    HOOK_HEADERS,
  );
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
  return number;
}

async function stockOf(adminPage: Page, productId: string): Promise<number> {
  const res = await api<{ data: { variants: { quantity: number }[] } }>(
    adminPage,
    'GET',
    `/admin/products/${productId}`,
  );
  return res.body.data.variants[0]!.quantity;
}

test('a delivered order is returned, approved, received, refunded and restocked', async ({
  browser,
}) => {
  const admin = await adminSession(browser);
  const product = await createProduct(admin.page, `E2E Return Tug ${unique('')}`, 20);

  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  const email = uniqueEmail();
  await register(buyer, email);
  await expect(buyer).toHaveURL(/\/account$/);
  const number = await checkout(buyer, email, product.variants[0]!.id, 2);
  expect(await stockOf(admin.page, product.id)).toBe(18);

  // Not delivered yet: nothing to return.
  await buyer.goto(`/account/orders/${number}`);
  await expect(buyer.getByRole('button', { name: 'Return items' })).toHaveCount(0);

  for (const to of ['processing', 'shipped', 'delivered']) {
    const moved = await api(admin.page, 'POST', `/admin/orders/${number}/transition`, { to });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  }

  // The customer asks to return both units.
  await buyer.reload();
  await buyer.getByRole('button', { name: 'Return items' }).click();
  const form = buyer.getByTestId('return-request-form');
  await form.getByRole('checkbox', { name: /E2E Return Tug/ }).check();
  await form.getByLabel(/Quantity of/).selectOption('2');
  await form.getByLabel('Why are you returning it?').selectOption('wrong_size');
  await expect(form.getByTestId('return-preview')).toContainText('€30.00');
  await form.getByRole('button', { name: 'Send return request' }).click();
  const card = buyer.getByTestId('return-card');
  await expect(card).toContainText('Return requested');

  // The admin works the queue: approve, receive (stock comes back), refund (simulated gateway).
  await admin.page.goto('/admin/returns');
  await admin.page
    .getByTestId('admin-return-row')
    .filter({ hasText: number })
    .getByRole('link')
    .click();
  await admin.page.getByRole('button', { name: 'Approve return' }).click();
  await expect(admin.page.getByRole('button', { name: 'Mark received' })).toBeVisible();
  expect(await stockOf(admin.page, product.id)).toBe(18); // not restocked before it arrives
  await admin.page.getByRole('button', { name: 'Mark received' }).click();
  await expect(admin.page.getByRole('button', { name: /^Refund/ })).toBeVisible();
  expect(await stockOf(admin.page, product.id)).toBe(20);
  await admin.page.getByRole('button', { name: 'Refund €30.00' }).click();
  await expect(admin.page.getByText('Nothing more to do for this return.')).toBeVisible();

  // The customer sees it refunded, and the order itself is refunded (every line came back).
  await buyer.reload();
  await expect(buyer.getByTestId('return-card')).toContainText('Refunded €30.00');
  await expect(buyer.getByTestId('order-status-badge')).toContainText('Refunded');
  const detail = await api<{ data: { order: { status: string } } }>(
    admin.page,
    'GET',
    `/admin/orders/${number}`,
  );
  expect(detail.body.data.order.status).toBe('refunded');

  await admin.context.close();
  await buyerCtx.close();
});

test('a vet-approval order is held after payment and goes on when an admin approves it', async ({
  browser,
}) => {
  const admin = await adminSession(browser);
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  const email = uniqueEmail();
  await register(buyer, email);
  await expect(buyer).toHaveURL(/\/account$/);

  // The product page of a flagged item says so; checkout then asks for the vet.
  await buyer.goto('/products/calm-chews');
  await expect(buyer.getByTestId('vet-banner')).toContainText("Needs a vet's okay");
  const product = await api<{ data: { variants: { id: string }[] } }>(
    buyer,
    'GET',
    '/products/calm-chews',
  );
  const variantId = product.body.data.variants[0]!.id;
  await api(buyer, 'POST', '/cart/items', { variantId, quantity: 1 });
  await buyer.goto('/checkout');
  await expect(buyer.getByTestId('vet-details-form')).toBeVisible();
  await buyer.getByTestId('checkout-continue-shipping').click();
  await expect(buyer.getByLabel("Vet's name")).toHaveAttribute('aria-invalid', 'true');

  // Placing without vet details is refused by the API, with them it is held after payment.
  const refused = await api(buyer, 'POST', '/checkout', {
    email,
    shippingAddress: ADDRESS,
    shippingMethodCode: 'standard',
  });
  expect(refused.status).toBe(422);
  const number = await checkout(
    buyer,
    email,
    variantId,
    1,
    {
      vetDetails: {
        vetName: 'Dr Rosa Marsh',
        clinic: 'Pawside Vet Clinic',
        vetEmail: 'rosa@pawside-vet.test',
      },
    },
    true,
  );
  await buyer.goto(`/account/orders/${number}`);
  await expect(buyer.getByTestId('order-status-badge')).toContainText('Waiting for vet approval');

  await admin.page.goto('/admin/vet-approvals');
  const row = admin.page.getByTestId('admin-vet-row').filter({ hasText: number });
  await expect(row).toContainText('Dr Rosa Marsh');
  await row.getByRole('button', { name: /^Approve order/ }).click();
  await expect(admin.page.getByTestId('admin-vet-row').filter({ hasText: number })).toHaveCount(0);

  await buyer.reload();
  await expect(buyer.getByTestId('order-status-badge')).toContainText('Being packed');
  await admin.page.getByRole('button', { name: 'Approved' }).click();
  await expect(admin.page.getByTestId('admin-vet-row').filter({ hasText: number })).toContainText(
    'VET-SIM-',
  );

  await admin.context.close();
  await buyerCtx.close();
});

test('the analytics page reports revenue and offers CSV downloads', async ({ browser }) => {
  const admin = await adminSession(browser);
  const product = await createProduct(admin.page, `E2E Analytics Tug ${unique('')}`, 5);
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await checkout(buyer, uniqueEmail(), product.variants[0]!.id, 1);

  await admin.page.goto('/admin/analytics');
  const kpis = admin.page.getByTestId('analytics-kpi');
  await expect(kpis).toHaveCount(4);
  await expect(kpis.first()).not.toContainText('€0.00');
  await expect(admin.page.getByTestId('analytics-chart')).toBeVisible();
  await expect(admin.page.getByTestId('analytics-top-product').first()).toBeVisible();
  await expect(admin.page.getByTestId('analytics-low-stock')).toBeVisible();

  await admin.page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(admin.page).toHaveURL(/days=7/);

  // The CSV is a real download of the streamed export.
  const csvHref = await admin.page.getByRole('link', { name: 'Orders CSV' }).getAttribute('href');
  const csv = await api<null>(admin.page, 'GET', csvHref!.replace('/api/v1', ''));
  expect(csv.status).toBe(200);

  await admin.context.close();
  await buyerCtx.close();
});
