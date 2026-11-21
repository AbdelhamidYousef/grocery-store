// Quick delivery (phase G5): a fee for a chosen one-hour slot, and a higher one for express (within
// 30 minutes). The old parcel method `standard` stays in the table, switched off, so orders placed
// with it keep their snapshot and old rows still resolve. G9 refines fees by slot and area.
export const shippingMethods = [
  {
    code: 'slot',
    name: 'Delivery in your slot',
    baseCents: 299,
    perKgCents: 0,
    freeOverCents: 4900,
    // Same day: the table keeps the columns of the parcel era, the slot is the real promise.
    etaDaysMin: 0,
    etaDaysMax: 0,
    isActive: true,
  },
  {
    // No free threshold: express is always a paid upgrade.
    code: 'express',
    name: 'Express delivery (30 minutes)',
    baseCents: 499,
    perKgCents: 0,
    freeOverCents: null,
    etaDaysMin: 0,
    etaDaysMax: 0,
    isActive: true,
  },
  {
    code: 'standard',
    name: 'Standard delivery',
    baseCents: 490,
    perKgCents: 100,
    freeOverCents: 4900,
    etaDaysMin: 3,
    etaDaysMax: 5,
    isActive: false,
  },
];
