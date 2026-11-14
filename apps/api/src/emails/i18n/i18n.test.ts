import { describe, expect, it } from 'vitest';

import { renderQueuedEmail } from '../index.ts';
import { newsletterConfirm } from '../newsletter.ts';
import { orderConfirmation } from '../order-confirmation.ts';
import { orderShipped } from '../order-shipped.ts';

import { de } from './de.ts';
import { en } from './en.ts';
import { emailText } from './index.ts';

const holes = (entry: unknown): string[] =>
  [...JSON.stringify(entry).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

const order = {
  number: 'PW-2026-000007',
  status: 'paid' as const,
  paymentStatus: 'succeeded' as const,
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
    fullName: 'Ada Lovelace',
    line1: 'Lindenstrasse 1',
    line2: null,
    city: 'London',
    postalCode: 'SW1A 1AA',
    country: 'DE',
  },
  billingAddress: null,
  notes: null,
  items: [
    {
      id: 'i1',
      productName: 'Rope toy',
      variantName: 'Red',
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

describe('email dictionaries', () => {
  it.each([['de', de]])(
    '%s has exactly the keys, placeholders and plural shape of English',
    (_lang, dict) => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(typeof dict[key] === 'string', key).toBe(typeof en[key] === 'string');
        expect(holes(dict[key]), key).toEqual(holes(en[key]));
      }
    },
  );

  it('picks plurals by language and falls back to English for an unknown store', () => {
    expect(emailText('de-de').tn('news.confirm.hours', 1)).toContain('1 Stunde gültig');
    expect(emailText('de-de').tn('news.confirm.hours', 48)).toContain('48 Stunden');
    expect(emailText('nope').lang).toBe('en');
    expect(emailText(undefined).tn('news.confirm.hours', 1)).toContain('1 hour.');
  });
});

describe('order emails in the order language', () => {
  it('confirmation in German: German words, euros in the German format, store-prefixed link', () => {
    const mail = orderConfirmation(order, emailText('de-de'));
    expect(mail.subject).toBe('Ihre Grocery-Bestellung PW-2026-000007 ist bestätigt');
    expect(mail.text).toContain('Vielen Dank für Ihre Bestellung, Ada Lovelace!');
    expect(mail.text).toContain('Zwischensumme: 25,98');
    expect(mail.text).toContain('Gesamtsumme: 30,88');
    expect(mail.text).toContain('/de-de/track-order?number=PW-2026-000007');
    expect(mail.html).toContain('<html lang="de">');
    expect(mail.html).toContain('Menge 2');
  });

  it('English keeps the number format of en-DE and the shipped mail follows the same language', () => {
    const mail = orderShipped(order, emailText('de-en'));
    expect(mail.subject).toBe('Your Grocery order PW-2026-000007 is on its way');
    expect(mail.text).toContain('€25.98');
    expect(orderShipped(order, emailText('de-de')).subject).toContain('ist unterwegs');
  });

  it('other mails render in the language too, and an unknown store falls back to English', () => {
    expect(
      newsletterConfirm(
        { confirmUrl: 'https://x/c', unsubscribeUrl: 'https://x/u', hours: 48 },
        emailText('de-de'),
      ).subject,
    ).toBe('Bestätigen Sie Ihr Grocery-Abonnement');
    expect(
      renderQueuedEmail(
        'newsletter_confirm',
        null,
        { confirmUrl: 'https://x/c', unsubscribeUrl: 'https://x/u', hours: 48 },
        'zz-zz',
      )?.subject,
    ).toBe(en['news.confirm.subject']);
  });
});
