import { expect, test, type Page } from '@playwright/test';

import { api, uniqueEmail } from './helpers';

// The whole purchase with the keyboard as the only input: skip link, add to cart, the cart drawer
// (focus trapped inside, Escape closes, focus handed back to its button), the checkout steps (focus
// follows the shopper, errors land on the field) and the paid confirmation. Payment is simulated
// the way checkout.spec.ts does it: the Stripe iframe cannot be driven here anyway, and what this
// file is about is everything around it.

// Presses Tab until the focused element matches the selector. Fails with the path it took, so a
// broken tab order is visible in the report instead of "timed out".
async function tabTo(page: Page, selector: string, max = 60): Promise<void> {
  const path: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sel) => {
      const el = document.activeElement;
      return {
        matches: !!el?.matches(sel),
        label: el ? el.tagName + (el.id ? `#${el.id}` : '') : '',
      };
    }, selector);
    if (hit.matches) return;
    path.push(hit.label);
  }
  throw new Error(`Tab never reached ${selector}; visited ${path.join(' > ')}`);
}

// A native modal <dialog> makes the page behind it inert. Tabbing past its last control hands focus
// to the browser's own UI (in headless Chromium: <body>), then back to its first control; it never
// reaches the page behind. So "trapped" means: inside the dialog, or nowhere in the page.
const trapped = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body || !!el.closest('dialog');
  });

const focusedIn = (page: Page, selector: string) =>
  page.evaluate((sel) => !!document.activeElement?.closest(sel), selector);

// A visible focus indicator: either an outline or a box-shadow ring on the focused element (the
// global :focus-visible rule in globals.css), or on the label a visually hidden radio points to.
async function hasFocusIndicator(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const seen = (e: Element) => {
      const cs = getComputedStyle(e);
      return (
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
      );
    };
    if (seen(el)) return true;
    // A visually hidden control (1px radio): its visible twin is the next sibling or its label.
    const label = el.closest('label');
    return !!label && [...label.querySelectorAll('*')].some(seen);
  });
}

test('buy a product with the keyboard only', async ({ page }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail();

  // --- skip link: first Tab stop, jumps past the header ---
  await page.goto('/products/bouncy-rubber-ball');
  await expect(page.getByTestId('add-to-cart')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('skip-link')).toBeFocused();
  await expect(page.getByTestId('skip-link')).toBeInViewport();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(
    await focusedIn(page, '#main'),
    'the first Tab after the skip link lands inside <main>',
  ).toBe(true);

  // --- add to cart; every stop on the way shows a focus indicator ---
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(() =>
      document.activeElement?.matches('[data-testid=add-to-cart]'),
    );
    expect(await hasFocusIndicator(page), `stop ${i} has a visible focus indicator`).toBe(true);
    if (done) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.getByTestId('add-to-cart')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast').filter({ hasText: /^Added 1 x/ })).toBeVisible();

  // --- the cart drawer: a real modal ---
  const cartButton = page.getByTestId('mini-cart-button');
  await cartButton.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Your cart' });
  await expect(drawer).toBeVisible();
  expect(await focusedIn(page, 'dialog'), 'focus moves into the drawer').toBe(true);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await trapped(page), `Tab ${i + 1} stays inside the drawer`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(cartButton, 'focus returns to the button that opened the drawer').toBeFocused();

  // --- through the drawer to checkout ---
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await tabTo(page, '[data-testid=cart-checkout]');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Contact and address' })).toBeVisible();

  // --- an invalid submit puts focus on the first bad field and says why ---
  await tabTo(page, '[data-testid=checkout-continue-shipping]');
  await page.keyboard.press('Enter');
  const emailField = page.getByTestId('checkout-email');
  await expect(emailField).toBeFocused();
  await expect(emailField).toHaveAttribute('aria-invalid', 'true');
  await expect(emailField).toHaveAccessibleDescription(/Invalid email address/);

  // --- fill the form by typing, Tab between fields ---
  await page.keyboard.type(email);
  await page.getByLabel('Full name').focus();
  await page.keyboard.type('Sam Rivers');
  await page.getByLabel('Address line 1').focus();
  await page.keyboard.type('1 Bone Street');
  await page.getByLabel('Postal code').focus();
  await page.keyboard.type('10115');
  await page.getByLabel('City').focus();
  await page.keyboard.type('Berlin');
  await tabTo(page, '[data-testid=checkout-continue-shipping]');
  await page.keyboard.press('Enter');

  // --- shipping step: focus follows to the new step instead of falling onto <body> ---
  await expect(page.getByRole('heading', { name: 'Shipping method' })).toBeFocused();
  await expect(page.getByTestId('shipping-option').first()).toBeVisible();
  await tabTo(page, 'input[type=radio]');
  expect(await hasFocusIndicator(page), 'the shipping radio shows focus').toBe(true);
  const code = await page.evaluate(() => (document.activeElement as HTMLInputElement).value);
  await tabTo(page, '[data-testid=checkout-continue-payment]');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeFocused();
  await expect(
    page.getByTestId('payment-not-configured').or(page.getByTestId('payment-element')),
  ).toBeVisible();

  // --- pay through the simulator, then the confirmation announces itself ---
  const order = await api<{ data: { orderNumber: string } }>(page, 'POST', '/checkout', {
    email,
    shippingAddress: {
      fullName: 'Sam Rivers',
      line1: '1 Bone Street',
      postalCode: '10115',
      city: 'Berlin',
      country: 'DE',
    },
    shippingMethodCode: code,
  });
  expect(order.status, JSON.stringify(order.body)).toBe(200);
  const orderNumber = order.body.data.orderNumber;
  const sim = await api(
    page,
    'POST',
    '/test/webhooks/simulate',
    { orderNumber },
    { 'x-test-hook-secret': process.env.TEST_HOOK_SECRET ?? '' },
  );
  expect(sim.status, JSON.stringify(sim.body)).toBe(200);
  await page.goto(`/checkout/confirmation/${orderNumber}`);
  await expect(page.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid', {
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the filters drawer traps focus and gives it back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/c/dogs');
  const toggle = page.getByTestId('filters-toggle');
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Filters' });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await trapped(page), `Tab ${i + 1} stays inside the drawer`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('sign-in errors are announced to assistive technology', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.test');
  await page.getByLabel('Password').fill('wrong-password-123');
  await page.keyboard.press('Enter');
  const alert = page.getByRole('alert').filter({ hasText: /./ });
  await expect(alert.first()).toBeVisible();
});
