import type { Dictionary } from '../types';

export const delivery = {
  // Header chip
  'delivery.chip.deliverTo': 'Deliver to {postcode}',
  'delivery.chip.enter': 'Enter postcode',
  'delivery.chip.notServed': 'No delivery to {postcode}',
  'delivery.chip.shortEnter': 'Postcode',
  'delivery.chip.label': 'Delivery postcode: {state}',

  // The postcode dialog and form (also the home hero)
  'delivery.dialog.title': 'Where should we deliver?',
  'delivery.dialog.lead':
    'We deliver inside Berlin. Your postcode decides which of our stores packs your order.',
  'delivery.form.label': 'Your postcode',
  'delivery.form.hint':
    'We deliver inside Berlin. Your postcode decides which store packs your order.',
  'delivery.form.button': 'Check delivery',
  'delivery.form.invalid': 'Enter a 5-digit postcode',
  'delivery.form.clear': 'Remove postcode',

  // What we found
  'delivery.result.served': 'We deliver to {postcode} · {area}',
  'delivery.result.packedAt': 'Your order is packed at {store}.',
  'delivery.result.notServed': "We don't deliver to {postcode} yet.",
  'delivery.result.cover': 'We deliver to these areas:',
  'delivery.result.checking': 'Checking {postcode}',
  'delivery.result.error': "We couldn't check that postcode. Try again in a moment.",
  'delivery.result.allAreas': 'See where we deliver',

  // Availability follows the store
  'delivery.soldOutAt': 'Sold out at {area}',

  // Checkout
  'delivery.checkout.notServed': "We don't deliver to {postcode} yet. We cover {areas}.",

  // The /delivery page
  'delivery.page.title': 'Where we deliver',
  'delivery.page.seo': 'The Berlin areas Grocery delivers to, and the store that packs each one.',
  'delivery.page.lead':
    'We deliver inside Berlin from four small stores that only ship: no walk-in shoppers. Your postcode decides which store packs your order, and what you can buy depends on its shelves.',
  'delivery.page.store': 'Packed at {name}, {street}, {postalCode} Berlin',
  'delivery.page.postcodes': 'Postcodes',
  'delivery.page.loading': 'Loading the delivery areas',
  'delivery.page.error': "We couldn't load the delivery areas. Try again in a moment.",
  'delivery.page.yours': 'Your postcode is here',
} satisfies Dictionary;
