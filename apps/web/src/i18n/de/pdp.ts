import type { pdp as enNs } from '../en/pdp';
import type { Entry } from '../types';

export const pdp: Record<keyof typeof enNs, Entry> = {
  // ---- product page ----
  'pdp.page.home': 'Startseite',
  'pdp.page.loadError.seoTitle': 'Etwas ist schiefgelaufen',
  'pdp.page.loadError.title': 'Dieses Produkt konnte nicht geladen werden',
  'pdp.page.loadError.retry': 'Erneut versuchen',
  'pdp.page.loading': 'Produkt wird geladen',
  'pdp.page.reviewCount': { one: '{count} Bewertung', other: '{count} Bewertungen' },
  'pdp.page.soldOut': 'Ausverkauft',
  'pdp.page.inStock': 'Auf Lager',
  'pdp.page.sku': 'Art.-Nr. {sku}',
  'pdp.page.trialSize': 'Probiergröße',
  'pdp.page.trialNote':
    'Eine Probe zum Ausprobieren: eine pro Kunde. Für die Originalgröße gibt es keine Begrenzung.',
  'pdp.page.attr.storage': 'Lagerung',
  'pdp.page.attr.origin': 'Herkunft',
  'pdp.page.attr.size': 'Größe',
  'pdp.page.attr.brand': 'Marke',
  'pdp.page.attr.goodFor': 'Gut für',

  // ---- tabs ----
  'pdp.tabs.label': 'Produktinformationen',
  'pdp.tabs.description': 'Beschreibung',
  'pdp.tabs.specs': 'Daten',
  'pdp.tabs.delivery': 'Lieferung & Rücksendung',

  // ---- specs ----
  'pdp.tabs.nutrition': 'Nährwerte & Zutaten',
  'pdp.food.nutritionHeading': 'Nährwertangaben',
  'pdp.food.typicalValues': 'Durchschnittliche Werte',
  'pdp.food.per100g': 'pro 100 g',
  'pdp.food.per100ml': 'pro 100 ml',
  'pdp.food.energy': 'Brennwert',
  'pdp.food.energyValue': '{kj} kJ / {kcal} kcal',
  'pdp.food.grams': '{value} g',
  'pdp.food.fat': 'Fett',
  'pdp.food.saturates': 'davon gesättigte Fettsäuren',
  'pdp.food.carbs': 'Kohlenhydrate',
  'pdp.food.sugars': 'davon Zucker',
  'pdp.food.fibre': 'Ballaststoffe',
  'pdp.food.protein': 'Eiweiß',
  'pdp.food.salt': 'Salz',
  'pdp.food.ingredientsHeading': 'Zutaten',
  'pdp.food.ingredientsNote': 'Allergene sind fett gedruckt.',
  'pdp.food.noIngredients': 'Zu diesem Produkt sind keine Zutaten angegeben.',
  'pdp.food.allergensHeading': 'Allergene',
  'pdp.food.contains': 'Enthält:',
  'pdp.food.noAllergens': 'Keine Allergene angegeben.',

  'pdp.specs.heading': 'Technische Daten',
  'pdp.specs.analysis': 'Garantierte Analyse',
  'pdp.specs.per100': 'Pro 100 g.',
  'pdp.specs.per100Variant': 'Pro 100 g, {variant}.',
  'pdp.specs.constituent.protein': 'Eiweiß',
  'pdp.specs.constituent.fat': 'Fett',
  'pdp.specs.constituent.fibre': 'Rohfaser',
  'pdp.specs.constituent.ash': 'Rohasche',
  'pdp.specs.constituent.moisture': 'Feuchtigkeit',
  'pdp.specs.constituent.kcal': 'Energie',
  'pdp.specs.kcal': '{value} kcal',
  'pdp.specs.percent': '{value} %',

  // ---- FAQ ----
  'pdp.faq.heading': 'Fragen und Antworten',

  // ---- delivery panel ----
  'pdp.delivery.heading': 'Lieferung',
  'pdp.delivery.shipIntro':
    'Wir liefern in Zeitfenstern von einer Stunde aus dem Laden, der deine Bestellung packt, oder mit Express innerhalb von 30 Minuten. Du wählst die Zeit an der Kasse und siehst den genauen Preis, bevor du bezahlst. Preise und Lieferzeiten findest du auf der Seite',
  'pdp.delivery.shipLink': 'Lieferseite',
  'pdp.delivery.shipOutro': '.',
  'pdp.delivery.cutoffNote':
    'Ein Zeitfenster kannst du bis 60 Minuten vor Beginn buchen. Wir halten es 15 Minuten für dich frei, während du bezahlst.',
  'pdp.delivery.returnsHeading': 'Rücksendung',
  'pdp.delivery.returnsIntro':
    'Anders überlegt? Unbenutzte Artikel in der Originalverpackung können innerhalb von 30 Tagen zurückgesendet werden. Geöffnete Lebensmittel und Hygieneartikel sind von der Rücksendung ausgeschlossen, es sei denn, sie sind fehlerhaft. Siehe',
  'pdp.delivery.returnsLink': 'Rücksendung und Widerruf',

  // ---- bought together ----
  'pdp.bought.heading': 'Wird oft zusammen gekauft',
  'pdp.bought.thisItem': 'Dieser Artikel:',
  'pdp.bought.notAvailable': '(nicht verfügbar)',
  'pdp.bought.withVariant': '{name} ({variant})',
  'pdp.bought.view': 'Ansehen',
  'pdp.bought.viewLabel': '{name} ansehen',
  'pdp.bought.anItem': 'Ein Artikel',
  'pdp.bought.problem': '{name}: {message}',
  'pdp.bought.total': 'Gesamt',
  'pdp.bought.beforeDiscounts': 'Vor Rabatten.',
  'pdp.bought.addAll': 'Alle hinzufügen',
  'pdp.bought.addAllCount': {
    one: 'Alle hinzufügen ({count} Artikel)',
    other: 'Alle hinzufügen ({count} Artikel)',
  },

  // ---- bundles and kits ----
  'pdp.bundle.heading': 'Das ist im Set enthalten',
  'pdp.bundle.qtyLine': '{qty} x {name}',
  'pdp.bundle.saving': '{saving} sparen gegenüber Einzelkauf ({individual})',
  'pdp.kits.heading': 'Als Set kaufen',
  'pdp.kits.save': '{saving} sparen',

  // ---- rails ----
  'pdp.related.heading': 'Das könnte dir auch gefallen',
  'pdp.related.label': 'Ähnliche Produkte',
  'pdp.recent.heading': 'Zuletzt angesehen',
};
