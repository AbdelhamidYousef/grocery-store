import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { lookupFor } from '../../i18n';
import { renderWithProviders } from '../../test/render';
import { deliveryKindLabel, orderStatusLabel, PAYMENT_STATUS_LABEL } from '../admin/order-status';

import { OrderStatusBadge } from './OrderStatusBadge';

describe('paid order wording', () => {
  it('says the payment is secured until the money is taken, then charged', () => {
    renderWithProviders(<OrderStatusBadge status="paid" />);
    expect(screen.getByTestId('order-status-badge')).toHaveTextContent('Payment secured');
  });

  it('says charged once captured, and only for a paid order', () => {
    renderWithProviders(<OrderStatusBadge status="paid" captured />);
    expect(screen.getByTestId('order-status-badge')).toHaveTextContent('Charged');
  });

  it('has the German words', () => {
    const de = lookupFor('de-DE');
    expect(de.t('account.status.paid')).toBe('Zahlung gesichert');
    expect(de.t('account.status.charged')).toBe('Abgebucht');
  });

  it('labels the admin status the same way', () => {
    expect(orderStatusLabel('paid', null)).toBe('Payment secured');
    expect(orderStatusLabel('paid', 1200)).toBe('Charged');
    expect(orderStatusLabel('shipped', 1200)).toBe('Shipped');
  });

  it('names the admin payment row and delivery kind plainly', () => {
    expect(PAYMENT_STATUS_LABEL.authorized).toBe('Held on the card');
    expect(PAYMENT_STATUS_LABEL.succeeded).toBe('Charged');
    expect(deliveryKindLabel({ code: 'slot', name: 'Delivery in your slot' })).toBe('slot');
    expect(deliveryKindLabel({ code: 'pickup', name: 'Pick up' })).toBe('Pick up');
  });
});
