import type { content as enNs } from '../en/content';
import type { Entry } from '../types';

export const content: Record<keyof typeof enNs, Entry> = {
  // Guides
  'content.guides.title': 'Rezepte und Tipps',
  'content.guides.seoDescription': 'Kurze Rezepte und Küchentipps für den Alltag.',
  'content.guides.intro':
    'Kurze, freundliche Lektüre für die Küche. Geschrieben für einen Demo-Shop, also versteh sie als Inspiration.',
  'content.guides.topics': 'Ratgeber-Themen',
  'content.guides.all': 'Alle Ratgeber',
  'content.guides.list': 'Ratgeber',
  'content.guides.listError': 'Die Ratgeber konnten nicht geladen werden.',
  'content.guides.retry': 'Erneut versuchen',
  'content.guides.noPage': 'Seite {page} gibt es nicht.',
  'content.guides.empty': 'Hier gibt es noch keine Ratgeber. Schau bald wieder vorbei.',
  'content.guides.seeAll': 'Alle Ratgeber ansehen',
  'content.guides.minRead': '{minutes} Min. Lesezeit',
  'content.guides.errorTitle': 'Etwas ist schiefgelaufen',
  'content.guides.loadError': 'Dieser Ratgeber konnte nicht geladen werden',
  'content.guides.home': 'Startseite',
  'content.guides.guides': 'Ratgeber',
  'content.guides.products': 'In diesem Ratgeber erwähnte Produkte',
  'content.guides.more': 'Weitere Ratgeber',

  // Help centre
  'content.help.title': 'Hilfecenter',
  'content.help.seoDescription': 'Antworten zu Versand, Rücksendungen, Zahlung und deinem Konto.',
  'content.help.intro': 'Suche oder wähle ein Thema.',
  'content.help.searchLabel': 'Hilfe durchsuchen',
  'content.help.searchInput': 'Hilfecenter durchsuchen',
  'content.help.topics': 'Hilfethemen',
  'content.help.allTopics': 'Alle Themen',
  'content.help.topic.shipping': 'Versand',
  'content.help.topic.returns': 'Rücksendungen',
  'content.help.topic.payments': 'Zahlung',
  'content.help.topic.accounts': 'Konto',
  'content.help.articles': 'Hilfeartikel',
  'content.help.error': 'Die Hilfeartikel konnten nicht geladen werden.',
  'content.help.retry': 'Erneut versuchen',
  'content.help.nothingFound': 'Nichts gefunden für „{q}“.',
  'content.help.noArticles': 'In diesem Thema gibt es noch keine Artikel.',
  'content.help.tryDifferent': 'Versuche andere Suchbegriffe oder',
  'content.help.browseAll': 'stöbere durch alle Themen',
  'content.help.stuck': '. Brauchst du noch Hilfe?',
  'content.help.contact': 'Kontaktiere uns',
  'content.help.contactRest': 'und ein echter Mensch antwortet dir.',
  'content.help.results': {
    one: '{count} Antwort für „{q}“',
    other: '{count} Antworten für „{q}“',
  },

  // Legal pages (the Markdown bodies stay English)
  'content.legal.notice':
    'Demo-Shop, fiktives Unternehmen. Dieser Text ist ein Beispiel und stellt keine Rechtsberatung dar.',
  'content.legal.about.title': 'Über Grocery',
  'content.legal.about.description': 'Wer hinter diesem Demo-Shop steckt.',
  'content.legal.shipping.title': 'Versand',
  'content.legal.shipping.description': 'Lieferoptionen, Preise und Zeiten.',
  'content.legal.returns.title': 'Rücksendung und Widerruf',
  'content.legal.returns.description': 'So funktionieren Rücksendung und Widerruf.',
  'content.legal.privacy.title': 'Datenschutzerklärung',
  'content.legal.privacy.description': 'Welche Daten wir erheben und warum.',
  'content.legal.terms.title': 'Allgemeine Geschäftsbedingungen',
  'content.legal.terms.description': 'Beispiel-AGB für den Demo-Shop.',
  'content.legal.cookies.title': 'Cookies',
  'content.legal.cookies.description':
    'Die Cookies, die wir setzen, und die, die wir nicht setzen.',
  'content.legal.accessibility.title': 'Erklärung zur Barrierefreiheit',
  'content.legal.accessibility.description':
    'Unsere Ziele zur Barrierefreiheit und bekannte Lücken.',

  // Contact
  'content.contact.title': 'Kontakt',
  'content.contact.seoDescription': 'Schreib dem Grocery-Team.',
  'content.contact.intro':
    'Fragen zu einer Bestellung, einem Produkt oder deinen Daten? Schreib uns, und ein Mensch antwortet dir. Vielleicht findest du schnell eine Antwort im',
  'content.contact.helpLink': 'Hilfecenter',
  'content.contact.name': 'Dein Name',
  'content.contact.email': 'E-Mail',
  'content.contact.emailHint': 'An diese Adresse antworten wir.',
  'content.contact.topic': 'Worum geht es?',
  'content.contact.topicChoose': 'Thema wählen',
  'content.contact.topicRequired': 'Wähle, worum es in deiner Nachricht geht',
  'content.contact.topic.order': 'Meine Bestellung',
  'content.contact.topic.shipping': 'Versand und Lieferung',
  'content.contact.topic.returns': 'Rücksendungen und Erstattungen',
  'content.contact.topic.product': 'Ein Produkt',
  'content.contact.topic.account': 'Mein Konto',
  'content.contact.topic.privacy': 'Meine Daten und Datenschutz',
  'content.contact.topic.other': 'Etwas anderes',
  'content.contact.order': 'Bestellnummer (optional)',
  'content.contact.message': 'Deine Nachricht',
  'content.contact.honeypot': 'Bitte leer lassen',
  'content.contact.send': 'Nachricht senden',
  'content.contact.tooMany':
    'Du hast bereits mehrere Nachrichten gesendet. Bitte warte eine Weile und versuche es dann erneut.',
  'content.contact.failed':
    'Deine Nachricht konnte gerade nicht gesendet werden. Bitte versuche es gleich noch einmal.',
  'content.contact.sentTitle': 'Nachricht gesendet',
  'content.contact.thanks': 'Danke, wir haben deine Nachricht erhalten',
  'content.contact.referenceBefore': 'Deine Referenznummer lautet',
  'content.contact.referenceAfter':
    '. Wir haben dir eine Kopie per E-Mail geschickt und antworten an diese Adresse, in der Regel innerhalb von zwei Werktagen.',
  'content.contact.browseHelp': 'Hilfecenter durchstöbern',

  // /developers
  'content.dev.seoTitle': 'Für Entwickler: Agent-Tools',
  'content.dev.seoDescription':
    'Grocery bietet strukturierte WebMCP-Tools, damit KI-Agenten im Browser den Demo-Katalog durchsuchen und einen Warenkorb füllen können. Experimentell, nur Testdaten.',
  'content.dev.title': 'Einkaufen mit einem KI-Agenten',
  'content.dev.note':
    'Dies ist ein Demo-Shop mit Testdaten, und WebMCP ist eine experimentelle Browser-Funktion. Nichts davon ist eine stabile öffentliche API.',
  'content.dev.whatTitle': 'Was ist WebMCP?',
  'content.dev.whatText':
    'WebMCP ist ein Entwurf der W3C Web Machine Learning Community Group. Eine Seite registriert Tools beim Browser, und ein im Browser integrierter KI-Agent ruft sie mit JSON-Argumenten auf, statt den Bildschirm auszulesen. Die Tools laufen in deinem Tab, mit deiner eigenen Sitzung und deinem eigenen Warenkorb, über dieselbe API, die auch die Website selbst nutzt. Ein Agent kann also nie mehr tun als du. In einem Browser ohne WebMCP verhalten sich diese Seite und der gesamte Shop wie gewohnt.',
  'content.dev.tryTitle': 'So probierst du es aus',
  'content.dev.try1': 'Verwende Chrome 146 oder neuer (zum Zeitpunkt des Schreibens Canary).',
  'content.dev.try2Before': 'Öffne',
  'content.dev.try2After': ', stell es auf „Enabled“ und starte den Browser neu.',
  'content.dev.try3':
    'Öffne diesen Shop und bitte den Agenten deines Browsers, Milch zu finden und in den Warenkorb zu legen.',
  'content.dev.tryNote':
    'Der Name des Flags und die API ändern sich noch; zuletzt geprüft im November 2026. Tests mit Browser-Agenten erfolgen manuell: Die automatisierten Tests verwenden einen Platzhalter für die Browser-API.',
  'content.dev.toolsTitle': 'Die {count} Tools',
  'content.dev.readsOnly': '(nur lesend)',
  'content.dev.changesCart': '(ändert den Warenkorb)',
  'content.dev.schema': 'Eingabeschema',
  'content.dev.exampleCall': 'Beispielaufruf',
  'content.dev.exampleResult': 'Beispielergebnis',
  'content.dev.errorsLead': 'Fehler kommen zurück als',
  'content.dev.errorsMid': 'mit den shopeigenen Codes, zum Beispiel',
  'content.dev.errorsAnd': 'und',
  'content.dev.errorsRest':
    '. Aufrufe sind auf 30 pro Minute begrenzt, und jede Änderung am Warenkorb durch einen Agenten wird auf dem Bildschirm angezeigt.',
  'content.dev.notExposedTitle': 'Was bewusst nicht freigegeben ist',
  'content.dev.notExposed.checkout':
    'Kasse und Zahlung: Ein Agent füllt den Warenkorb, ein Mensch prüft und bezahlt.',
  'content.dev.notExposed.orders':
    'Bestellungen aufgeben oder stornieren sowie den Bestellverlauf lesen.',
  'content.dev.notExposed.account':
    'Konto-, Adress-, Kartendaten sowie Treuepunkte und Wunschliste.',
  'content.dev.notExposed.clicking':
    'Alles, was der angemeldete Kunde nicht ohnehin per Klick tun könnte.',

  // Messages from outside (shared Zod rules)
  'msg.content.required': 'Pflichtfeld',
  'msg.content.emailInvalid': 'Gib eine gültige E-Mail-Adresse ein',
  'msg.content.messageShort': 'Erzähl uns etwas mehr (mindestens 10 Zeichen)',
};
