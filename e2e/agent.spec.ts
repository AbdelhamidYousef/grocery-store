import { expect, test, type Page } from '@playwright/test';

// Phase 24. Real agent-in-browser testing is manual (see /developers); here a stand-in for the
// browser's WebMCP API is injected before the app loads, and the "agent" is the test calling the
// tools the store registered. Needs the seeded dev database like the other specs.
const SIX_TOOLS = [
  'add_to_cart',
  'get_cart',
  'get_product',
  'search_catalog',
  'search_shop_policies_and_faqs',
  'update_cart_lines',
];

async function installFakeModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: unknown) => Promise<unknown> }>();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: (tool: { name: string; execute: (input: unknown) => Promise<unknown> }) => {
          tools.set(tool.name, tool);
        },
      },
    });
    Object.assign(window, {
      __toolNames: () => [...tools.keys()].sort(),
      __callTool: (name: string, input: unknown) => tools.get(name)?.execute(input),
    });
  });
}

const callTool = <T>(page: Page, name: string, input: unknown): Promise<T> =>
  page.evaluate(
    ([n, i]) =>
      (window as unknown as { __callTool: (n: string, i: unknown) => Promise<unknown> }).__callTool(
        n as string,
        i,
      ),
    [name, input],
  ) as Promise<T>;

test('an agent finds a product and fills the cart through the registered tools', async ({
  page,
}) => {
  await installFakeModelContext(page);
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __toolNames: () => string[] }).__toolNames()),
    )
    .toEqual(SIX_TOOLS);

  const found = await callTool<{ products: { slug: string; inStock: boolean }[] }>(
    page,
    'search_catalog',
    { query: 'bouncy rubber ball', limit: 5 },
  );
  const hit = found.products.find((p) => p.slug === 'bouncy-rubber-ball' && p.inStock);
  expect(hit, 'the seeded Bouncy Rubber Ball is found and in stock').toBeTruthy();

  const product = await callTool<{
    name: string;
    variants: { variantId: string; available: boolean }[];
  }>(page, 'get_product', { slug: 'bouncy-rubber-ball' });
  const variant = product.variants.find((v) => v.available);
  expect(variant).toBeTruthy();

  const added = await callTool<{ itemCount: number }>(page, 'add_to_cart', {
    variantId: variant?.variantId,
    quantity: 1,
  });
  expect(added.itemCount).toBe(1);
  // The human sees what the agent did.
  await expect(
    page.getByTestId('toast').filter({ hasText: `Assistant added ${product.name} to your cart` }),
  ).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  const cart = await callTool<{ lines: { product: string }[] }>(page, 'get_cart', {});
  expect(cart.lines.map((l) => l.product)).toEqual([product.name]);

  // A bad input is a coded error, not a throw, and changes nothing.
  expect(await callTool(page, 'add_to_cart', { variantId: 'nope', quantity: 1 })).toMatchObject({
    error: { code: 'VALIDATION_ERROR' },
  });

  await page.goto('/cart');
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText(product.name);
});

test('without modelContext the store runs as before, with no console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.goto('/developers');
  await expect(page.getByTestId('agent-tool')).toHaveCount(6);
  expect(problems).toEqual([]);
});
