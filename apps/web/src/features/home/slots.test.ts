import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { clearHomeSlots, getHomeSlots, registerHomeSlot, type HomeSlotId } from './slots';

const slot = (id: HomeSlotId, enabled?: () => boolean) => ({
  id,
  render: () => createElement('div', null, id),
  ...(enabled && { enabled }),
});

afterEach(clearHomeSlots);

describe('home slot registry', () => {
  it('orders slots by the fixed id list, whatever the registration order', () => {
    registerHomeSlot(slot('newsletter'));
    registerHomeSlot(slot('seasonal'));
    registerHomeSlot(slot('customer-gallery'));
    registerHomeSlot(slot('recently-viewed'));
    expect(getHomeSlots().map((s) => s.id)).toEqual([
      'seasonal',
      'recently-viewed',
      'customer-gallery',
      'newsletter',
    ]);
  });

  it('skips unregistered and disabled slots', () => {
    registerHomeSlot(slot('newsletter'));
    registerHomeSlot(slot('seasonal', () => false));
    expect(getHomeSlots().map((s) => s.id)).toEqual(['newsletter']);
  });

  it('replaces a slot registered twice', () => {
    registerHomeSlot(slot('newsletter'));
    registerHomeSlot(slot('newsletter'));
    expect(getHomeSlots()).toHaveLength(1);
  });
});
