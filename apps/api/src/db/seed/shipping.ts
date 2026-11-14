export const shippingMethods = [
  {
    code: 'standard',
    name: 'Standard delivery',
    baseCents: 490,
    perKgCents: 100,
    freeOverCents: 4900,
    byCurrency: { GBP: { baseCents: 450, perKgCents: 100, freeOverCents: 4200 } },
    etaDaysMin: 3,
    etaDaysMax: 5,
    isActive: true,
  },
  {
    // No free threshold: express is always a paid upgrade.
    code: 'express',
    name: 'Express delivery',
    baseCents: 990,
    perKgCents: 200,
    freeOverCents: null,
    byCurrency: { GBP: { baseCents: 890, perKgCents: 180, freeOverCents: null } },
    etaDaysMin: 1,
    etaDaysMax: 2,
    isActive: true,
  },
];
