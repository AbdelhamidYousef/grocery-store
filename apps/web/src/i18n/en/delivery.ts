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

  // ---------- delivery times (G5) ----------
  'delivery.slots.title': 'Choose a delivery time',
  'delivery.slots.lead': 'Pick a one-hour slot. We hold it for 15 minutes while you check out.',
  'delivery.slots.loading': 'Loading delivery times',
  'delivery.slots.loadError': "We couldn't load the delivery times.",
  'delivery.slots.none': 'No delivery times are open right now. Try again later.',
  'delivery.slots.days': 'Delivery day',
  'delivery.slots.hours': 'Delivery time on {day}',
  'delivery.slots.today': 'Today',
  'delivery.slots.tomorrow': 'Tomorrow',
  'delivery.slots.full': 'Full',
  'delivery.slots.closed': 'Closed',
  'delivery.slots.left': {
    one: '{count} left',
    other: '{count} left',
  },
  'delivery.slots.yours': 'Your slot',
  'delivery.slots.continue': 'Continue to payment',

  'delivery.express.title': 'Express',
  'delivery.express.lead': 'At your door in about 30 minutes',
  'delivery.express.closed': 'Express is only offered while the store is open.',
  'delivery.express.busy': 'All riders are out right now. Try again in a few minutes.',
  'delivery.express.noPostcode': 'Enter your postcode to see express delivery.',

  'delivery.hold.label': 'Held for {time}',
  'delivery.hold.expired': 'Your slot is no longer held. Pick a time again.',
  'delivery.hold.aria': 'Your slot is held for about {minutes} more minutes',

  'delivery.window.arrives': 'Arrives {when}',
  'delivery.window.express': 'Express, by {time}',
  'delivery.window.expressCart': 'Express, within 30 minutes',
  'delivery.window.heading': 'Delivery time',

  'delivery.next.slot': 'Next delivery: {when}',
  'delivery.next.express': 'Express in 30 minutes',
  'delivery.next.noPostcode': 'Enter your postcode to see delivery times.',

  'delivery.error.slotFull': 'That slot just filled up. Pick another time.',
  'delivery.error.slotClosed': 'That slot is closed. Pick another time.',
  'delivery.error.wrongArea':
    'That slot is for another delivery area. Pick a time for your address.',
  'delivery.error.holdExpired':
    'Your slot was held for 15 minutes and has run out. Pick a time again.',
  'delivery.error.expressUnavailable':
    'Express is not available right now. Pick a time or try again in a few minutes.',
  'delivery.error.required': 'Pick a delivery time to continue.',
} satisfies Dictionary;
