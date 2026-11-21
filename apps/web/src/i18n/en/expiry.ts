// Best-before dates and short-dated offers (phase G6).
export const expiry = {
  'expiry.bestBefore': 'Best before at least {date}',
  'expiry.short.title': 'Short date',
  'expiry.short.offer': {
    one: '{count} pack, best before {date}, {percent} % off',
    other: '{count} packs, best before {date}, {percent} % off',
  },
  'expiry.short.why': 'Still good, just closer to its date. Cheaper while it lasts.',
  'expiry.short.price': '{price} each',
  'expiry.short.add': 'Add short-dated',
  'expiry.short.addAria': 'Add short-dated {name} to your cart',
  'expiry.cart.badge': 'Short date',
  'expiry.cart.note': 'Best before {date}, {percent} % off',
  'expiry.shelf.title': 'Short-dated deals',
  'expiry.shelf.lead': 'Still good, closer to their date, {percent} % off at your store.',
  'expiry.shelf.label': 'Short-dated deals at your store',
} as const;
