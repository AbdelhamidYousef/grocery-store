import type { delivery as enNs } from '../en/delivery';
import type { Entry } from '../types';

export const delivery: Record<keyof typeof enNs, Entry> = {
  // Header chip
  'delivery.chip.deliverTo': 'Lieferung an {postcode}',
  'delivery.chip.enter': 'PLZ eingeben',
  'delivery.chip.notServed': 'Keine Lieferung nach {postcode}',
  'delivery.chip.shortEnter': 'PLZ',
  'delivery.chip.label': 'Liefer-PLZ: {state}',

  // The postcode dialog and form (also the home hero)
  'delivery.dialog.title': 'Wohin sollen wir liefern?',
  'delivery.dialog.lead':
    'Wir liefern innerhalb Berlins. Deine Postleitzahl entscheidet, welcher unserer Läden deine Bestellung packt.',
  'delivery.form.label': 'Deine Postleitzahl',
  'delivery.form.hint':
    'Wir liefern innerhalb Berlins. Deine Postleitzahl entscheidet, welcher Laden packt.',
  'delivery.form.button': 'Lieferung prüfen',
  'delivery.form.invalid': 'Gib eine fünfstellige Postleitzahl ein',
  'delivery.form.clear': 'Postleitzahl entfernen',

  // What we found
  'delivery.result.served': 'Wir liefern nach {postcode} · {area}',
  'delivery.result.packedAt': 'Deine Bestellung wird bei {store} gepackt.',
  'delivery.result.notServed': 'Nach {postcode} liefern wir noch nicht.',
  'delivery.result.cover': 'Wir liefern in diese Bezirke:',
  'delivery.result.checking': '{postcode} wird geprüft',
  'delivery.result.error':
    'Wir konnten diese Postleitzahl nicht prüfen. Versuch es gleich noch einmal.',
  'delivery.result.allAreas': 'Hier liefern wir hin',

  // Availability follows the store
  'delivery.soldOutAt': 'In {area} ausverkauft',

  // Checkout
  'delivery.checkout.notServed': 'Nach {postcode} liefern wir noch nicht. Wir liefern in {areas}.',

  // The /delivery page
  'delivery.page.title': 'Wohin wir liefern',
  'delivery.page.seo':
    'Die Berliner Bezirke, in die Grocery liefert, und der Laden, der sie packt.',
  'delivery.page.lead':
    'Wir liefern innerhalb Berlins aus vier kleinen Läden, die nur versenden: keine Laufkundschaft. Deine Postleitzahl entscheidet, welcher Laden deine Bestellung packt, und was du kaufen kannst, hängt von seinen Regalen ab.',
  'delivery.page.store': 'Gepackt bei {name}, {street}, {postalCode} Berlin',
  'delivery.page.postcodes': 'Postleitzahlen',
  'delivery.page.loading': 'Liefergebiete werden geladen',
  'delivery.page.error':
    'Wir konnten die Liefergebiete nicht laden. Versuch es gleich noch einmal.',
  'delivery.page.yours': 'Deine Postleitzahl liegt hier',
};
