import { expect, test, type Browser, type Page } from '@playwright/test';

import { ADMIN, api, reachMinimum, register, restock, restockFiller, uniqueEmail } from './helpers';

// The case study in code (phase G10): one shopper, one bag, from the postcode in the hero to the
// door. A weighed item, a short-dated pack and a bottle with deposit go in the basket; a slot is
// held; the card (simulated gateway, NODE_ENV=test API) is only HELD; the packer picks, weighs and
// finds one line missing with a replacement; the shopper refuses the replacement; the rider takes the
// bag (which captures); tracking says "On the way" and the final bill leaves the refused swap out
// and keeps the deposit, the bag and the delivery fee.
//
// Independent of the time of day: no assertion about express, and the slot is the first open one
// found by looking through the day tabs (today may be used up or closed).

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

function berlinTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const [y = 0, m = 0, d = 0] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

async function adminSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const login = await api(page, 'POST', '/auth/login', ADMIN);
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { context, page };
}

// The ordered yoghurt (10.00, with 3 packs dated tomorrow, so it has a short-dated offer). Its
// replacement is whatever "closest match" picks from the subcategory.
async function orderedYoghurt(page: Page) {
  const tree = await api<{ data: { id: string; children: { id: string }[] }[] }>(
    page,
    'GET',
    '/categories',
  );
  const parent = tree.body.data.find((c) => c.children.length > 0);
  const categoryId = parent?.children[0]?.id ?? tree.body.data[0]!.id;
  const make = async (label: string, priceCents: number, shortDated: boolean) => {
    const sku = `E2E-G10-${Date.now().toString(36)}-${priceCents}`.toUpperCase();
    const name = `E2E ${label} yoghurt ${sku}`;
    const created = await api<{ data: { slug: string; variants: { id: string }[] } }>(
      page,
      'POST',
      '/admin/products',
      {
        name,
        description: 'Created by the G10 journey spec.',
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
    const variantId = created.body.data.variants[0]!.id;
    if (shortDated) {
      const stock = await api(page, 'PATCH', `/admin/inventory/${variantId}`, {
        quantity: 23,
        reason: 'restock',
        bestBefore: berlinTomorrow(),
      });
      expect(stock.status, JSON.stringify(stock.body)).toBe(200);
    }
    return { slug: created.body.data.slug, variantId, name };
  };
  return { ordered: await make('ordered', 1000, true) };
}

// The first open slot, looking through the day tabs.
async function pickFirstOpenSlot(page: Page): Promise<void> {
  const open = page.locator('[data-testid=delivery-slot][data-status=open]');
  const tabs = page.getByTestId('delivery-day-tab');
  await expect(page.getByTestId('delivery-slot').first()).toBeVisible();
  for (let i = 0; i < (await tabs.count()) && (await open.count()) === 0; i++) {
    await tabs.nth(i).click();
  }
  await open.first().click();
  await expect(page.getByTestId('delivery-hold')).toContainText(/Held for 1[45]:\d\d/);
}

test('the grocery journey: postcode, basket, slot, card hold, picking with a refused swap, rider, bill', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    Boolean(process.env.STRIPE_SECRET_KEY),
    'Real Stripe is configured: the simulator cannot pay its intents (the real-card test covers it).',
  );
  test.setTimeout(180_000);
  await restock(browser, baseURL, ['bananas', 'still-water-1-5l']);
  await restockFiller(browser, baseURL);
  const admin = await adminSession(browser);
  const { ordered } = await orderedYoghurt(admin.page);

  const customer = await browser.newContext();
  const shop = await customer.newPage();
  const email = uniqueEmail();
  await register(shop, email);
  await expect(shop).toHaveURL(/\/account$/);

  // 1. The postcode in the hero names the area.
  await shop.goto('/');
  await shop.getByLabel('Your postcode').fill('10115');
  await shop.getByRole('button', { name: 'Check delivery' }).click();
  await expect(shop.getByRole('status').filter({ hasText: 'We deliver to 10115' })).toBeVisible();
  await expect(shop.getByTestId('delivery-chip')).toContainText('Deliver to 10115');

  // 2. The basket: a short-dated pack through its offer, loose bananas, bottles with deposit.
  await shop.goto(`/products/${ordered.slug}`);
  await shop.getByTestId('short-dated-offer').getByTestId('add-short-dated').click();
  await expect(shop.getByTestId('toast').filter({ hasText: 'added' })).toBeVisible();
  await shop.goto('/products/bananas');
  await shop.getByTestId('add-to-cart').click();
  await expect(shop.getByTestId('toast').first()).toBeVisible();
  const water = await api<{ data: { variants: { id: string }[] } }>(
    shop,
    'GET',
    '/products/still-water-1-5l',
  );
  const added = await api(shop, 'POST', '/cart/items', {
    variantId: water.body.data.variants[0]!.id,
    quantity: 6,
  });
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  await reachMinimum(shop);

  await shop.goto('/cart');
  await expect(shop.getByTestId('cart-line-short-dated')).toContainText('% off');
  await expect(shop.getByTestId('weighed-notice')).toContainText('Final price after weighing');
  await expect(shop.getByTestId('cart-deposit')).toContainText('€1.50');
  await expect(shop.getByTestId('cart-minimum')).toHaveCount(0);
  await expect(shop.getByTestId('cart-checkout')).toBeEnabled();

  // 3. Checkout: address, then a held delivery slot.
  await shop.goto('/checkout');
  await shop.getByTestId('checkout-email').fill(email);
  await shop.getByLabel('Full name').fill(ADDRESS.fullName);
  await shop.getByLabel('Address line 1').fill(ADDRESS.line1);
  await shop.getByLabel('Postal code').fill(ADDRESS.postalCode);
  await shop.getByLabel('City').fill(ADDRESS.city);
  await shop.getByTestId('checkout-continue-shipping').click();
  await pickFirstOpenSlot(shop);
  await shop.getByTestId('checkout-continue-payment').click();
  await expect(
    shop.getByTestId('payment-not-configured').or(shop.getByTestId('payment-element')),
  ).toBeVisible();

  // 4. Pay with the (simulated) test card: the order is placed and the card only HELD.
  const placed = await api<{ data: { orderNumber: string } }>(shop, 'POST', '/checkout', {
    email,
    shippingAddress: ADDRESS,
    shippingMethodCode: 'slot',
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
  await shop.goto(`/checkout/confirmation/${number}`);
  await expect(shop.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid');
  await expect(shop.getByTestId('order-held')).toContainText('We hold up to');

  // 5. The packer view: weigh the bananas, find the plain lines, record the yoghurt as missing with
  // the closest match as the replacement.
  await admin.page.goto(`/admin/picking?order=${number}`);
  await admin.page.getByLabel('Store').selectOption('mitte');
  const bag = admin.page.getByTestId('picking-bag');
  await expect(bag).toContainText(number);
  await bag.getByLabel('Grams on the scale').fill('940');
  await bag.getByRole('button', { name: 'Weigh' }).click();
  const itemsOf = async () =>
    (
      await api<{ data: { order: { items: { id: string; productName: string }[] } } }>(
        admin.page,
        'GET',
        `/admin/orders/${number}`,
      )
    ).body.data.order.items;
  const idsBefore = new Set((await itemsOf()).map((i) => i.id));
  const yoghurtLine = bag.getByTestId('picking-line').filter({ hasText: ordered.name });
  await yoghurtLine.getByRole('button', { name: 'Not all found' }).click();
  const dialog = admin.page.getByRole('dialog');
  await dialog.getByLabel('Units found').fill('0');
  // "Closest match": the server picks the safe replacement (the radio list is capped, and the dev
  // database holds many products of this subcategory from earlier runs).
  await expect(dialog.getByLabel('Closest match')).toBeChecked();
  await dialog.getByRole('button', { name: 'Record shortfall' }).click();
  await expect(
    admin.page.getByTestId('toast').filter({ hasText: 'Shortfall recorded' }),
  ).toBeVisible();
  const swap = (await itemsOf()).find((i) => !idsBefore.has(i.id));
  expect(swap, 'the replacement is a new line of the order').toBeDefined();
  const swapName = swap!.productName;
  // The other plain lines (not the yoghurt, not its replacement) are found. Each click settles one
  // line and removes its button.
  const plain = bag
    .getByTestId('picking-line')
    .filter({ hasNotText: ordered.name })
    .filter({ hasNotText: swapName })
    .getByRole('button', { name: /^Found all/ });
  for (let guard = 0; guard < 10 && (await plain.count()) > 0; guard++) {
    const before = await plain.count();
    await plain.first().click();
    await expect(plain).toHaveCount(before - 1);
  }

  // 6. The shopper sees the change on the order page and refuses the replacement.
  await shop.goto(`/account/orders/${number}`);
  const changes = shop.getByTestId('order-changes');
  await expect(changes).toContainText('Changes to your order');
  await expect(changes).toContainText(swapName);
  await shop.getByTestId('swap-reject').click();
  await expect(shop.getByTestId('order-change-state')).toContainText(
    'Rejected. You are not charged for it.',
  );

  // 7. Pack and hand to the rider: the card is captured once, for what was really packed.
  await admin.page.goto(`/admin/picking?order=${number}`);
  await admin.page.getByLabel('Store').selectOption('mitte');
  const bag2 = admin.page.getByTestId('picking-bag');
  await bag2.getByRole('button', { name: 'Bag packed' }).click();
  await expect(bag2).toContainText('Packed.');
  await bag2.getByRole('button', { name: 'Hand to rider' }).click();
  await expect(admin.page.getByTestId('picking-bag')).toHaveCount(0);

  // 8. Tracking says "On the way".
  await shop.goto(`/track-order?number=${number}`);
  await shop.getByLabel('Email').fill(email);
  await shop.getByRole('button', { name: 'Track order' }).click();
  await expect(shop.getByTestId('track-status')).toContainText('On the way');

  // 9. The final bill: the replacement and the missing yoghurt are not charged; deposit, bags and the
  // delivery fee are lines of it.
  const mine = await api<{
    data: {
      status: string;
      capturedCents: number;
      authorizedCents: number;
      totals: { depositCents: number; bagFeeCents: number; shippingCents: number };
    };
  }>(shop, 'GET', `/account/orders/${number}`);
  expect(mine.body.data.status).toBe('shipped');
  expect(mine.body.data.capturedCents).toBeGreaterThan(0);
  expect(mine.body.data.capturedCents).toBeLessThan(mine.body.data.authorizedCents);
  expect(mine.body.data.totals.depositCents).toBe(150);
  expect(mine.body.data.totals.bagFeeCents).toBeGreaterThan(0);
  await shop.goto(`/account/orders/${number}`);
  const bill = shop.getByTestId('order-summary');
  await expect(bill).toContainText('Bottle deposit');
  await expect(bill).toContainText('Paper bags');
  await expect(bill).toContainText('Delivery');
  await expect(shop.getByTestId('order-final-bill')).toContainText(
    `€${(mine.body.data.capturedCents / 100).toFixed(2)}`,
  );
  await expect(shop.getByTestId('order-item-weighed')).toContainText('Weighed: 940 g');
  // The refused replacement is not a charged line of the bill.
  await expect(bill).not.toContainText(swapName);

  await customer.close();
  await admin.context.close();
});
