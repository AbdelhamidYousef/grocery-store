import type { reviews as enNs } from '../en/reviews';
import type { Entry } from '../types';

export const reviews: Record<keyof typeof enNs, Entry> = {
  'reviews.heading': 'Kundenbewertungen',
  'reviews.loadError': 'Die Bewertungen konnten nicht geladen werden.',
  'reviews.retry': 'Erneut versuchen',
  'reviews.none': 'Noch keine Bewertungen. Teile als Erste oder Erster deine Erfahrung.',
  'reviews.outOf5': 'von 5',
  'reviews.ratingLabel': '{rating} von 5',
  'reviews.count': { one: '{count} Bewertung', other: '{count} Bewertungen' },
  'reviews.stars': { one: '{count} Stern', other: '{count} Sterne' },
  'reviews.recommend': '{percent} % würden dies empfehlen',
  'reviews.sort.label': 'Bewertungen sortieren',
  'reviews.sort.helpful': 'Hilfreichste',
  'reviews.sort.newest': 'Neueste',
  'reviews.sort.photos': 'Mit Fotos zuerst',
  'reviews.clearFilters': 'Filter löschen',
  'reviews.noMatch': 'Keine Bewertungen passen zu diesen Filtern.',
  'reviews.write': 'Bewertung schreiben',
  'reviews.signIn': 'Melde dich an,',
  'reviews.signInToWrite': 'um eine Bewertung zu schreiben.',

  'reviews.breakdown.label': 'Bewertungen nach Sternen',
  'reviews.breakdown.row': {
    one: '{count}-Sterne-Bewertungen: {n}',
    other: '{count}-Sterne-Bewertungen: {n}',
  },
  'reviews.breakdown.rowOn': {
    one: '{count}-Sterne-Bewertungen: {n}, Filter aktiv',
    other: '{count}-Sterne-Bewertungen: {n}, Filter aktiv',
  },
  'reviews.topics.heading': 'Was Kunden erwähnen',

  'reviews.card.verified': 'Verifizierter Kauf',
  'reviews.card.recommend': 'Würde empfehlen',
  'reviews.card.notRecommend': 'Würde nicht empfehlen',
  'reviews.card.photos': 'Kundenfotos',
  'reviews.card.openPhoto': 'Foto {n} von {total} öffnen',
  'reviews.card.photoTitle': 'Kundenfoto',
  'reviews.card.photoAlt': 'Foto aus der Bewertung von {author}: {title}',
  'reviews.card.helpful': 'Hilfreich ({count})',
  'reviews.card.markedHelpful': 'Als hilfreich markiert ({count})',
  'reviews.card.signInHelpful': 'Anmelden, um als hilfreich zu markieren ({count})',

  'reviews.form.title': '{name} bewerten',
  'reviews.form.rating': 'Deine Bewertung',
  'reviews.form.titleLabel': 'Titel',
  'reviews.form.bodyLabel': 'Deine Bewertung',
  'reviews.form.bodyHint': 'Wie hat es dir gefallen? 20 bis 2000 Zeichen.',
  'reviews.form.recommend': 'Ich würde dieses Produkt empfehlen',
  'reviews.form.photosLabel': 'Fotos (optional, bis zu {max}, je 3 MB)',
  'reviews.form.photosToUpload': 'Hochzuladende Fotos',
  'reviews.form.photoPreview': 'Vorschau von {name}',
  'reviews.form.remove': 'Entfernen',
  'reviews.form.uploadsOff': 'Der Foto-Upload ist in dieser Demo deaktiviert.',
  'reviews.form.note':
    'Bewertungen werden geprüft, bevor sie erscheinen. Bitte gib darin keine persönlichen Daten an.',
  'reviews.form.submit': 'Bewertung absenden',
  'reviews.form.photoType': '{name}: Verwende ein JPEG-, PNG- oder WebP-Bild',
  'reviews.form.photoSize': '{name}: Jedes Foto darf höchstens 3 MB groß sein',
  'reviews.form.photoMax': 'Du kannst bis zu {max} Fotos anhängen',
  'reviews.form.thanks': 'Danke. Deine Bewertung wartet auf Freigabe.',
  'reviews.form.thanksNote':
    'Wir prüfen jede Bewertung, bevor sie auf der Seite erscheint, in der Regel innerhalb weniger Tage.',
  'reviews.form.thanksVerified':
    'Du bekommst das Label „Verifizierter Kauf“, weil du dieses Produkt bei uns gekauft hast.',

  'msg.reviews.rating': 'Wähle eine Sternebewertung',
  'msg.reviews.titleShort': 'Gib deiner Bewertung einen kurzen Titel',
  'msg.reviews.titleLong': 'Höchstens 80 Zeichen',
  'msg.reviews.bodyShort': 'Bitte schreibe mindestens 20 Zeichen',
  'msg.reviews.bodyLong': 'Höchstens 2000 Zeichen',
};
