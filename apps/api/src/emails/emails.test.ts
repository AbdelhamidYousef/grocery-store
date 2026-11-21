import { formatMoney, type Order } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { emailText } from './i18n/index.ts';
import { escapeHtml } from './layout.ts';
import { orderConfirmation } from './order-confirmation.ts';
import { orderShipped } from './order-shipped.ts';
import { orderSwaps } from './order-swaps.ts';

const order: Order = {
  number: 'PW-2026-000007',
  status: 'paid',
  paymentStatus: 'succeeded',
  email: 'ada@grocery.test',
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
    line1: 'Lindenstrasse 1',
    line2: null,
    city: 'Berlin',
    postalCode: '10115',
    country: 'DE',
  },
  billingAddress: null,
  notes: null,
  authorizedCents: null,
  capturedCents: null,
  refundedCents: 0,
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
      pricePerKgCents: null,
      weighedGrams: null,
      finalCents: null,
      shortDated: false,
      pickStatus: 'pending' as const,
      pickedQty: null,
      substitutesItemId: null,
      swapStatus: null,
      listPriceCents: null,
      refundedCents: 0,
    },
  ],
  placedAt: null,
  delivery: null,
  createdAt: '2026-10-31T10:00:00.000Z',
};

describe('order emails', () => {
  it.each([
    ['confirmation', orderConfirmation],
    ['shipped', orderShipped],
  ])('%s carries the number, the lines and money formatted by the shared formatter', (_n, make) => {
    const email = make(order, emailText());
    const total = formatMoney(3088, 'EUR');
    expect(email.subject).toContain('PW-2026-000007');
    for (const part of [email.text, email.html]) {
      expect(part).toContain('PW-2026-000007');
      expect(part).toContain('Rope toy');
      expect(part).toContain(total);
      expect(part).toContain(formatMoney(490, 'EUR'));
    }
    expect(email.html.startsWith('<!doctype html>')).toBe(true);
    expect(email.html).toContain('Grocery');
  });

  it('escapes customer-supplied text in the HTML but not in the plain text', () => {
    const email = orderConfirmation(order, emailText());
    expect(email.html).not.toContain('<b>Lovelace</b>');
    expect(email.html).toContain('Ada &lt;b&gt;Lovelace&lt;/b&gt;');
    expect(email.text).toContain('Ada <b>Lovelace</b>');
  });

  it('says different things at different moments', () => {
    expect(orderConfirmation(order, emailText()).subject).toMatch(/confirmed/);
    expect(orderShipped(order, emailText()).subject).toMatch(/on its way/);
  });

  it('shows a discount line only when there is one', () => {
    const none = orderConfirmation(order, emailText()).text;
    expect(none).not.toContain('Discount');
    const some = orderConfirmation(
      { ...order, totals: { ...order.totals, discountCents: 100, totalCents: 2988 } },
      emailText(),
    ).text;
    expect(some).toContain(`Discount: -${formatMoney(100, 'EUR')}`);
  });

  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('order emails: the delivery window', () => {
  const slot = {
    ...order,
    delivery: {
      kind: 'slot' as const,
      from: '2026-11-23T13:00:00.000Z',
      to: '2026-11-23T14:00:00.000Z',
    },
  };

  it.each([
    ['confirmation', orderConfirmation],
    ['shipped', orderShipped],
  ])('%s says when the bag arrives, in Berlin time, in English and German', (_n, make) => {
    const en = make(slot, emailText('de-en'));
    // 13:00Z is 14:00 in Berlin in winter.
    expect(en.text).toMatch(/Arrives Mon.*23.*Nov 14:00–15:00/);
    expect(en.html).toMatch(/Delivery time<\/strong><br>Arrives Mon.*14:00–15:00/);
    const de = make(slot, emailText('de-de'));
    expect(de.text).toMatch(/Lieferung Mo.*23.*Nov.* 14:00–15:00/);
    expect(de.html).toContain('Lieferzeit');
  });

  it('says express by its end time, and says nothing for an order from before slots', () => {
    const express = {
      ...order,
      delivery: {
        kind: 'express' as const,
        from: '2026-11-23T13:00:00.000Z',
        to: '2026-11-23T13:30:00.000Z',
      },
    };
    expect(orderConfirmation(express, emailText('de-en')).text).toContain('Express, by 14:30');
    expect(orderConfirmation(order, emailText('de-en')).text).not.toMatch(/Arrives|Express, by/);
    expect(orderConfirmation(order, emailText('de-en')).html).not.toContain('Delivery time');
  });
});

describe('the "we changed something" email', () => {
  const swapped: Order = {
    ...order,
    items: [
      { ...order.items[0]!, pickStatus: 'substituted', pickedQty: 1 },
      {
        ...order.items[0]!,
        id: 'i2',
        productName: 'Rope <b>toy</b> deluxe',
        unitPriceCents: 1099,
        quantity: 1,
        lineTotalCents: 1099,
        pickStatus: 'picked',
        pickedQty: 1,
        substitutesItemId: 'i1',
        swapStatus: 'proposed',
      },
    ],
  };
  const payload = {
    links: [
      { itemId: 'i2', acceptUrl: 'https://shop.test/a?x=1&y=2', rejectUrl: 'https://shop.test/r' },
    ],
  };

  it('lists what changed with the price promise and the signed links, in English', () => {
    const mail = orderSwaps(swapped, payload, emailText('de-en'));
    expect(mail.subject).toContain('We changed something');
    expect(mail.text).toContain('Rope toy: we found 1 of 2.');
    expect(mail.text).toContain('You never pay more than the');
    expect(mail.text).toContain('https://shop.test/a?x=1&y=2');
    expect(mail.text).toContain('https://shop.test/r');
    expect(mail.text).toContain('If you do not answer before we dispatch');
    expect(mail.html).toContain('href="https://shop.test/a?x=1&amp;y=2"');
    expect(mail.html).not.toContain('<b>toy</b>');
  });

  it('is German with "du" in the German store', () => {
    const mail = orderSwaps(swapped, payload, emailText('de-de'));
    expect(mail.subject).toContain('geändert');
    expect(mail.text).toContain('Du zahlst nie mehr');
    expect(mail.text).not.toMatch(/\bSie\b/);
  });

  it('says plainly when an item is missing and nothing is charged for it', () => {
    const missing: Order = {
      ...order,
      items: [{ ...order.items[0]!, pickStatus: 'missing', pickedQty: 0 }],
    };
    const mail = orderSwaps(missing, null, emailText('de-en'));
    expect(mail.text).toContain('Rope toy is not in stock.');
    expect(mail.text).toContain('You will not be charged for what is missing.');
  });
});
