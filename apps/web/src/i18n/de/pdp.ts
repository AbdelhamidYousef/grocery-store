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
  'pdp.page.attr.pet': 'Haustier',
  'pdp.page.attr.material': 'Material',
  'pdp.page.attr.ageStage': 'Lebensphase',
  'pdp.page.attr.size': 'Größe',
  'pdp.page.attr.brand': 'Marke',
  'pdp.page.attr.goodFor': 'Gut für',
  'pdp.page.gallery.heading': 'Kunden mit diesem Produkt',
  'pdp.page.gallery.intro':
    'Fotos von echten Pawsome-Haustieren. Tippen Sie auf eines, um zu sehen, was darauf zu kaufen ist.',

  // ---- tabs ----
  'pdp.tabs.label': 'Produktinformationen',
  'pdp.tabs.description': 'Beschreibung',
  'pdp.tabs.specs': 'Daten',
  'pdp.tabs.delivery': 'Lieferung & Rücksendung',

  // ---- specs ----
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
    'Bestellungen werden an Werktagen aus unserem Lager versandt. Sie wählen an der Kasse Standard- oder Expresslieferung und sehen den genauen Preis, bevor Sie bezahlen. Preise und Lieferzeiten finden Sie auf der Seite',
  'pdp.delivery.shipLink': 'Versand',
  'pdp.delivery.shipOutro': '.',
  'pdp.delivery.cutoffNote':
    'Bestellungen, die an einem Werktag vor 15:00 Uhr Amsterdamer Zeit eingehen, werden am selben Tag versandt. Der Versandplan und die Feiertagsliste sind für diesen Demo-Shop erfunden.',
  'pdp.delivery.returnsHeading': 'Rücksendung',
  'pdp.delivery.returnsIntro':
    'Anders überlegt? Unbenutzte Artikel in der Originalverpackung können innerhalb von 30 Tagen zurückgesendet werden. Geöffnete Lebensmittel und Hygieneartikel sind von der Rücksendung ausgeschlossen, es sei denn, sie sind fehlerhaft. Siehe',
  'pdp.delivery.returnsLink': 'Rücksendung und Widerruf',

  // ---- delivery estimate ----
  'pdp.estimate.orderIn': 'Bestellen Sie in {countdown}, Lieferung {range}',
  'pdp.estimate.orderNow': 'Jetzt bestellen, Versand {day}, Lieferung {range}',
  'pdp.estimate.methodArrives': '{method}: Lieferung {range}',
  'pdp.estimate.methodArrivesSpoken': '{method}: Lieferung {range}.',
  'pdp.estimate.range': '{from} bis {to}',
  'pdp.estimate.spoken':
    'Bestellen Sie an einem Werktag vor {time}, dann wird Ihre Bestellung am selben Tag versandt.',
  'pdp.estimate.cutoffNote': 'Bestellschluss {time} Uhr Amsterdamer Zeit, Montag bis Freitag.',
  'pdp.estimate.countdownHm': '{h} Std. {m} Min.',
  'pdp.estimate.countdownM': '{m} Min.',
  'pdp.estimate.countdownUnderMinute': 'weniger als einer Minute',

  // ---- size guide ----
  'pdp.size.button': 'Größentabelle',
  'pdp.size.sizeColumn': 'Größe',
  'pdp.size.yourSize': '(Ihre Größe)',
  'pdp.size.howToMeasure': 'So messen Sie',
  'pdp.size.measure.neck': 'Hals',
  'pdp.size.measure.chest': 'Brust',
  'pdp.size.measure.length': 'Länge',

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
  'pdp.related.heading': 'Das könnte Ihnen auch gefallen',
  'pdp.related.label': 'Ähnliche Produkte',
  'pdp.recent.heading': 'Zuletzt angesehen',
};
