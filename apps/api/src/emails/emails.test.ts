import { formatMoney, type Order } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { escapeHtml } from './layout.ts';
import { orderConfirmation } from './order-confirmation.ts';
import { orderShipped } from './order-shipped.ts';

const order: Order = {
  number: 'PW-2026-000007',
  status: 'paid',
  paymentStatus: 'succeeded',
  email: 'ada@pawsome.test',
  totals: {
    currency: 'EUR',
    subtotalCents: 2598,
    shippingCents: 490,
    discountCents: 0,
    donationCents: 0,
    taxCents: 0,
    totalCents: 3088,
  },
  shippingMethod: { code: 'standard', name: 'Standard' },
  shippingAddress: {
    fullName: 'Ada <b>Lovelace</b>',
    line1: '1 Bone Street',
    line2: null,
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'LV',
  },
  billingAddress: null,
  notes: null,
  items: [
    {
      id: 'i1',
      productName: 'Rope toy',
      variantName: 'Red · Large',
      sku: 'PW-1',
      imageUrl: null,
      unitPriceCents: 1299,
      quantity: 2,
      lineTotalCents: 2598,
    },
  ],
  placedAt: null,
  createdAt: '2026-10-31T10:00:00.000Z',
};

describe('order emails', () => {
  it.each([
    ['confirmation', orderConfirmation],
    ['shipped', orderShipped],
  ])('%s carries the number, the lines and money formatted by the shared formatter', (_n, make) => {
    const email = make(order);
    const total = formatMoney(3088, 'EUR');
    expect(email.subject).toContain('PW-2026-000007');
    for (const part of [email.text, email.html]) {
      expect(part).toContain('PW-2026-000007');
      expect(part).toContain('Rope toy');
      expect(part).toContain(total);
      expect(part).toContain(formatMoney(490, 'EUR'));
    }
    expect(email.html.startsWith('<!doctype html>')).toBe(true);
    expect(email.html).toContain('Pawsome');
  });

  it('escapes customer-supplied text in the HTML but not in the plain text', () => {
    const email = orderConfirmation(order);
    expect(email.html).not.toContain('<b>Lovelace</b>');
    expect(email.html).toContain('Ada &lt;b&gt;Lovelace&lt;/b&gt;');
    expect(email.text).toContain('Ada <b>Lovelace</b>');
  });

  it('says different things at different moments', () => {
    expect(orderConfirmation(order).subject).toMatch(/confirmed/);
    expect(orderShipped(order).subject).toMatch(/on its way/);
  });

  it('shows a discount line only when there is one', () => {
    const none = orderConfirmation(order).text;
    expect(none).not.toContain('Discount');
    const some = orderConfirmation({
      ...order,
      totals: { ...order.totals, discountCents: 100, totalCents: 2988 },
    }).text;
    expect(some).toContain(`Discount: -${formatMoney(100, 'EUR')}`);
  });

  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});
