import type { expiry as enNs } from '../en/expiry';
import type { Entry } from '../types';

export const expiry: Record<keyof typeof enNs, Entry> = {
  'expiry.bestBefore': 'Mindestens haltbar bis {date}',
  'expiry.short.title': 'Kurzes Datum',
  'expiry.short.offer': {
    one: '{count} Packung, haltbar bis {date}, {percent} % günstiger',
    other: '{count} Packungen, haltbar bis {date}, {percent} % günstiger',
  },
  'expiry.short.why': 'Noch gut, nur näher am Datum. Günstiger, solange der Vorrat reicht.',
  'expiry.short.price': '{price} pro Stück',
  'expiry.short.add': 'Kurzes Datum hinzufügen',
  'expiry.short.addAria': '{name} mit kurzem Datum in den Warenkorb legen',
  'expiry.cart.badge': 'Kurzes Datum',
  'expiry.cart.note': 'Haltbar bis {date}, {percent} % günstiger',
  'expiry.shelf.title': 'Reduziert wegen kurzem Datum',
  'expiry.shelf.lead': 'Noch gut, näher am Datum, {percent} % günstiger in deinem Laden.',
  'expiry.shelf.label': 'Reduziert wegen kurzem Datum in deinem Laden',
};
