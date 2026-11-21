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

  // ---------- Lieferzeiten (G5) ----------
  'delivery.slots.title': 'Lieferzeit wählen',
  'delivery.slots.lead':
    'Wähle ein Zeitfenster von einer Stunde. Wir halten es 15 Minuten für dich frei, während du bezahlst.',
  'delivery.slots.loading': 'Lieferzeiten werden geladen',
  'delivery.slots.loadError': 'Wir konnten die Lieferzeiten nicht laden.',
  'delivery.slots.none': 'Gerade sind keine Lieferzeiten frei. Versuche es später noch einmal.',
  'delivery.slots.days': 'Liefertag',
  'delivery.slots.hours': 'Lieferzeit am {day}',
  'delivery.slots.today': 'Heute',
  'delivery.slots.tomorrow': 'Morgen',
  'delivery.slots.full': 'Voll',
  'delivery.slots.closed': 'Geschlossen',
  'delivery.slots.left': {
    one: '{count} frei',
    other: '{count} frei',
  },
  'delivery.slots.yours': 'Dein Zeitfenster',
  'delivery.slots.continue': 'Weiter zur Zahlung',

  'delivery.express.title': 'Express',
  'delivery.express.lead': 'In etwa 30 Minuten vor deiner Tür',
  'delivery.express.closed': 'Express gibt es nur, solange der Laden geöffnet ist.',
  'delivery.express.busy':
    'Alle Fahrer sind gerade unterwegs. Versuche es in ein paar Minuten noch einmal.',
  'delivery.express.noPostcode': 'Gib deine Postleitzahl ein, um Express zu sehen.',

  'delivery.hold.label': 'Reserviert für {time}',
  'delivery.hold.expired': 'Dein Zeitfenster ist nicht mehr reserviert. Wähle erneut eine Zeit.',
  'delivery.hold.aria': 'Dein Zeitfenster ist noch etwa {minutes} Minuten reserviert',

  'delivery.window.arrives': 'Lieferung {when}',
  'delivery.window.express': 'Express, bis {time}',
  'delivery.window.expressCart': 'Express, innerhalb von 30 Minuten',
  'delivery.window.heading': 'Lieferzeit',

  'delivery.next.slot': 'Nächste Lieferung: {when}',
  'delivery.next.express': 'Express in 30 Minuten',
  'delivery.next.noPostcode': 'Gib deine Postleitzahl ein, um Lieferzeiten zu sehen.',

  'delivery.error.slotFull': 'Dieses Zeitfenster ist gerade voll geworden. Wähle eine andere Zeit.',
  'delivery.error.slotClosed': 'Dieses Zeitfenster ist geschlossen. Wähle eine andere Zeit.',
  'delivery.error.wrongArea':
    'Dieses Zeitfenster gehört zu einem anderen Liefergebiet. Wähle eine Zeit für deine Adresse.',
  'delivery.error.holdExpired':
    'Dein Zeitfenster war 15 Minuten reserviert und ist abgelaufen. Wähle erneut eine Zeit.',
  'delivery.error.expressUnavailable':
    'Express ist gerade nicht verfügbar. Wähle ein Zeitfenster oder versuche es in ein paar Minuten noch einmal.',
  'delivery.error.required': 'Wähle eine Lieferzeit, um fortzufahren.',
};
