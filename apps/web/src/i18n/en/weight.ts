// Items sold by weight (phase G6).
export const weight = {
  'weight.about': 'about {weight} · {perKg}/kg · est. {price}',
  'weight.aboutShort': 'about {weight}',
  'weight.est': 'est. {price}',
  'weight.notice':
    'Final price after weighing. We hold up to {max} on your card and take only what it weighs.',
  // The order: what is held on the card, then the final bill.
  'weight.held': '{amount} is held on your card and charged when we pack your order.',
  'weight.heldWeighed':
    'We hold up to {amount} on your card and charge what your bag weighs: the final price comes after weighing.',
  'weight.weighed': 'Weighed: {weight}',
  'weight.finalBill': 'Final bill: {amount} charged to your card.',
  'weight.finalBillReleased':
    'Final bill: {amount} charged to your card. We had held {held}; the rest is released.',
} as const;
