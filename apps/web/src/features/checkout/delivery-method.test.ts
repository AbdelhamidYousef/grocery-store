import { describe, expect, it } from 'vitest';

import { lookupFor } from '../../i18n';

import { deliveryMethodName } from './delivery-method';

describe('deliveryMethodName', () => {
  const slot = { code: 'slot', name: 'Delivery in your slot' };
  it('speaks the store language', () => {
    expect(deliveryMethodName(slot, lookupFor('en-IE').t)).toBe('Delivery in your slot');
    expect(deliveryMethodName(slot, lookupFor('de-DE').t)).toBe(
      'Lieferung im gewählten Zeitfenster',
    );
    expect(deliveryMethodName({ code: 'express', name: 'x' }, lookupFor('de-DE').t)).toContain(
      'Express-Lieferung',
    );
  });
  it('keeps the stored name of a method nobody translated', () => {
    expect(deliveryMethodName({ code: 'pickup', name: 'Pick up' }, lookupFor('de-DE').t)).toBe(
      'Pick up',
    );
  });
});
