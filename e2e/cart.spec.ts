import { expect, test, type Page } from '@playwright/test';

import { PASSWORD, register, signOut, uniqueEmail } from './helpers';

// Needs the API on :3000 with the seeded dev database. Products used here are not low-stock or
// sold out in the seed: bouncy-rubber-ball, braided-tug-rope (default variants well stocked).
async function addFromProduct(page: Page, slug: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();
}

test('guest cart: add, survive a reload, change the quantity, remove, empty state', async ({
  page,
}) => {
  await addFromProduct(page, 'bouncy-rubber-ball');
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // The toast offers a way to the cart.
  await page.getByTestId('toast-action').click();
  await expect(page).toHaveURL(/\/cart$/);
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText('Bouncy Rubber Ball');

  // The guest cart lives in a cookie, so it survives a reload.
  await page.reload();
  await expect(lines).toHaveCount(1);
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // Quantity: + shows the new subtotal and badge.
  const unit = await page.getByTestId('cart-subtotal').innerText();
  await lines
    .first()
    .getByRole('button', { name: /^Increase quantity/ })
    .click();
  await expect(page.getByTestId('cart-count')).toHaveText('2');
  await expect(lines.first().getByRole('spinbutton')).toHaveValue('2');
  await expect(page.getByTestId('cart-subtotal')).not.toHaveText(unit);

  // A typed quantity applies on blur.
  await lines.first().getByRole('spinbutton').fill('4');
  await lines.first().getByRole('spinbutton').blur();
  await expect(page.getByTestId('cart-count')).toHaveText('4');

  // The mini cart is available from other pages.
  await page.goto('/');
  await page.getByTestId('mini-cart-button').click();
  await expect(page.getByTestId('mini-cart')).toContainText('Bouncy Rubber Ball');
  await page.getByTestId('dialog-close').click();

  await page.goto('/cart');
  await page.getByTestId('cart-line-remove').click();
  await expect(page.getByTestId('cart-empty')).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('adding more than the stock shows how many are available', async ({ page }) => {
  // Seeded as low stock: 1 to 4 units.
  await page.goto('/products/bell-and-mirror-toy?variant=PW-BIRD-BELL-GREEN');
  const qty = page.getByRole('spinbutton', { name: 'Quantity' });
  await qty.fill('10');
  await page.getByTestId('add-to-cart').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: /^Only [1-4] available\.$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('a guest cart is merged into the account on sign-in', async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);

  // The account's own cart holds a rope; then sign out.
  await addFromProduct(page, 'braided-tug-rope');
  await signOut(page);
  await expect(page.getByTestId('cart-count')).toHaveCount(0);

  // As a guest, add a ball; the rope must not be there.
  await addFromProduct(page, 'bouncy-rubber-ball');
  await page.goto('/cart');
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  // Sign in: both lines are in the cart.
  await page.goto('/login?next=%2Fcart');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/cart$/);
  const lines = page.getByTestId('cart-line');
  await expect(lines).toHaveCount(2);
  await expect(page.getByTestId('cart-count')).toHaveText('2');
  await expect(page.getByTestId('cart-warnings')).toHaveCount(0);
});
