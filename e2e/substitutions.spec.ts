import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, api, pickSlot, register, uniqueEmail } from './helpers';

// Phase G7, end to end on the simulated gateway: an order line is left on "best match", the admin
// records it as missing with a replacement, the shopper rejects the replacement in the account, and
// the final capture leaves out both the missing units and the rejected replacement.

const HOOK_HEADERS: Record<string, string> = process.env.TEST_HOOK_SECRET
  ? { 'x-test-hook-secret': process.env.TEST_HOOK_SECRET }
  : {};
const ADDRESS = {
  fullName: 'Sam Rivers',
  line1: '1 Market Street',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
};

async function adminSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { context, page };
}

// Two food products in one subcategory: the one that is ordered (10.00) and a dearer neighbour
// (12.00) that can replace it. The shopper is charged 10.00 for it: never above the original.
async function twoYoghurts(page: Page) {
  const tree = await api<{ data: { id: string; children: { id: string }[] }[] }>(
    page,
    'GET',
    '/categories',
  );
  const parent = tree.body.data.find((c) => c.children.length > 0);
  const categoryId = parent?.children[0]?.id ?? tree.body.data[0]!.id;
  const make = async (name: string, priceCents: number) => {
    const sku = `E2E-G7-${Date.now().toString(36)}-${priceCents}`.toUpperCase();
    const created = await api<{ data: { slug: string; variants: { id: string }[] } }>(
      page,
      'POST',
      '/admin/products',
      {
        name: `${name} ${sku}`,
        description: 'Created by the G7 e2e spec.',
        categoryId,
        status: 'active',
        attributes: { optionKeys: [], shelfLifeDays: 6 },
        variants: [
          {
            sku,
            name: 'Standard',
            options: {},
            priceCents,
            weightGrams: 200,
            stock: 20,
            isDefault: true,
          },
        ],
        images: [],
      },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return {
      slug: created.body.data.slug,
      variantId: created.body.data.variants[0]!.id,
      name: `${name} ${sku}`,
    };
  };
  return {
    original: await make('E2E ordered yoghurt', 1000),
    neighbour: await make('E2E neighbour yoghurt', 1200),
  };
}

test('a missing item with a replacement the shopper rejects: the final capture leaves both out', async ({
  browser,
}) => {
  const admin = await adminSession(browser);
  const { original, neighbour } = await twoYoghurts(admin.page);

  const customer = await browser.newContext();
  const shop = await customer.newPage();
  await register(shop, uniqueEmail());
  await expect(shop).toHaveURL(/\/account$/);

  // Two packs in the cart; the line starts on "Best match" and says what that means.
  const added = await api(shop, 'POST', '/cart/items', {
    variantId: original.variantId,
    quantity: 2,
  });
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  await shop.goto('/cart');
  const control = shop.getByTestId('substitution-control').first();
  await expect(control.getByRole('combobox')).toHaveValue('best_match');
  await expect(control).toContainText('You never pay more than for the original');

  // Pay (simulated card).
  await pickSlot(shop);
  const methods = await api<{ data: { code: string }[] }>(
    shop,
    'GET',
    `/checkout/shipping-methods?country=${ADDRESS.country}`,
  );
  const placed = await api<{ data: { orderNumber: string } }>(shop, 'POST', '/checkout', {
    email: uniqueEmail(),
    shippingAddress: ADDRESS,
    shippingMethodCode: methods.body.data[0]!.code,
  });
  expect(placed.status, JSON.stringify(placed.body)).toBe(200);
  const number = placed.body.data.orderNumber;
  const paid = await api(
    shop,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber: number },
    HOOK_HEADERS,
  );
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);

  // The packer finds none of them and swaps in the neighbour.
  const detail = await api<{
    data: {
      order: { totals: { totalCents: number }; items: { id: string; productName: string }[] };
    };
  }>(admin.page, 'GET', `/admin/orders/${number}`);
  const line = detail.body.data.order.items.find((i) => i.productName.includes('ordered'))!;
  const total = detail.body.data.order.totals.totalCents;
  const recorded = await api<{ data: { substituteItemId: string | null } }>(
    admin.page,
    'POST',
    `/admin/orders/${number}/items/${line.id}/shortfall`,
    { pickedQty: 0, substituteVariantId: neighbour.variantId },
  );
  expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
  expect(recorded.body.data.substituteItemId).not.toBeNull();

  // The shopper sees the change, what they save, and rejects it.
  await shop.goto(`/account/orders/${number}`);
  const changes = shop.getByTestId('order-changes');
  await expect(changes).toContainText('Changes to your order');
  await expect(changes).toContainText('Not in stock.');
  await expect(changes).toContainText(neighbour.name);
  await expect(shop.getByTestId('order-change-save')).toContainText('You save €4.00');
  await shop.getByTestId('swap-reject').click();
  await expect(shop.getByTestId('order-change-state')).toContainText(
    'Rejected. You are not charged for it.',
  );

  // The admin captures: nothing for the two missing packs and nothing for the rejected swap.
  const captured = await api(admin.page, 'POST', `/admin/orders/${number}/capture`, {});
  expect(captured.status, JSON.stringify(captured.body)).toBe(200);
  const after = await api<{ data: { capturedCents: number; items: { productName: string }[] } }>(
    shop,
    'GET',
    `/account/orders/${number}`,
  );
  expect(after.body.data.capturedCents).toBe(total - 2000);
  await shop.goto(`/account/orders/${number}`);
  await expect(shop.getByTestId('order-final-bill')).toContainText('Final bill');
  await expect(shop.getByTestId('order-final-bill')).toContainText(
    `€${((total - 2000) / 100).toFixed(2)}`,
  );

  await customer.close();
  await admin.context.close();
});
