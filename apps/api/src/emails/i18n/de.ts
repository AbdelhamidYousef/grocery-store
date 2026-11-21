import type { TextEntry } from '@store/shared';

import type { EmailKey } from './en.ts';

// Deutsche E-Mail-Texte (du-Form). Dieselben Schlüssel und Platzhalter wie en.ts.
export const de: Record<EmailKey, TextEntry> = {
  'mail.footer':
    'Grocery ist ein fiktiver Shop für ein Portfolio. Nichts hier ist echt und keine Karte wurde belastet.',
  'mail.signoff': '- Das Grocery-Team',
  'mail.hello': 'Hallo {name},',
  'mail.seeOrder': 'Bestellung ansehen',
  'mail.orderLine': 'Bestellung: {url}',

  'order.qty': 'Menge {quantity}',
  'order.subtotal': 'Zwischensumme',
  'order.shipping': 'Versand ({method})',
  'order.discount': 'Rabatt',
  'order.donation': 'Spende an Spreeufer Food Bank (Demo)',
  'order.total': 'Gesamtsumme',
  'order.shippingTo': 'Lieferadresse:',
  'order.deliveryTime': 'Lieferzeit',
  'order.arrives': 'Lieferung {when}',
  'order.arrivesExpress': 'Express, bis {time}',
  'order.deliveringTo': 'Wir liefern an:',

  'confirm.held':
    '{amount} ist auf deiner Karte reserviert und wird abgebucht, sobald wir deine Bestellung packen.',
  'confirm.heldWeighed':
    'Wir reservieren bis zu {amount} auf deiner Karte und buchen ab, was deine Tüte wiegt: der Endpreis steht nach dem Wiegen fest.',
  'bill.subject': 'Deine Schlussrechnung für die Grocery-Bestellung {number}',
  'bill.preheader': 'Wir haben {amount} für Bestellung {number} abgebucht.',
  'bill.heading': 'Deine Schlussrechnung',
  'bill.intro':
    'Hallo {name}, wir haben die Bestellung {number} gepackt und {amount} von deiner Karte abgebucht.',
  'bill.weighed': 'Gewogen: {product}, {grams} g, {price}',
  'bill.held': 'Reserviert waren {amount}; der Rest der Reservierung wird freigegeben.',
  'bill.total': 'Abgebucht',
  'confirm.subject': 'Deine Grocery-Bestellung {number} ist bestätigt',
  'confirm.thanks': 'Danke für deine Bestellung, {name}.',
  'confirm.paid': 'Die Bestellung {number} ist bezahlt und wir machen sie versandfertig.',
  'confirm.willEmail': 'Wir schreiben dir noch einmal, sobald sie versendet wird.',
  'confirm.follow': 'Verfolge deine Bestellung jederzeit: {url}',
  'confirm.preheader': 'Bestellung {number} ist bestätigt.',
  'confirm.heading': 'Danke für deine Bestellung.',
  'confirm.intro':
    'Hallo {name}, die Bestellung {number} ist bezahlt und wir machen sie versandfertig.',
  'confirm.track': 'Bestellung verfolgen',
  'confirm.trackNote': '(Du brauchst dafür die E-Mail-Adresse, mit der du bestellt hast).',

  'shipped.subject': 'Deine Grocery-Bestellung {number} ist unterwegs',
  'shipped.good': 'Gute Nachrichten, {name}: Die Bestellung {number} wurde versendet!',
  'shipped.method': 'Versandart: {method}',
  'shipped.preheader': 'Bestellung {number} wurde versendet.',
  'shipped.heading': 'Deine Bestellung ist unterwegs.',
  'shipped.intro': 'Hallo {name}, die Bestellung {number} wurde mit {method} versendet.',

  'withdrawal.subject': 'Wir haben deinen Widerruf zur Bestellung {number} erhalten',
  'withdrawal.body':
    'Diese E-Mail bestätigt, dass wir am {when} deine Erklärung zum Widerruf des Vertrags über die Bestellung {number} erhalten haben.',
  'withdrawal.reference': 'Referenz: {reference}',
  'withdrawal.covers': 'Betrifft: {scope}',
  'withdrawal.wholeOrder': 'die gesamte Bestellung',
  'withdrawal.reason': 'Dein angegebener Grund: {reason}',
  'withdrawal.next':
    'Wir melden uns mit den nächsten Schritten. Bewahre diese E-Mail als Nachweis auf.',
  'withdrawal.preheader': 'Widerruf zur Bestellung {number} erhalten.',
  'withdrawal.heading': 'Wir haben deinen Widerruf erhalten',

  'return.requested.subject': 'Wir haben deine Rücksendeanfrage zur Bestellung {order} erhalten',
  'return.requested.heading': 'Wir haben deine Rücksendeanfrage erhalten',
  'return.requested.l1':
    'Danke, deine Anfrage ({ref}) zur Bestellung {order} ist bei uns. Jemand sieht sie sich bald an und teilt dir den nächsten Schritt per E-Mail mit.',
  'return.requested.l2': 'Du möchtest zurücksenden: {list}.',
  'return.approved.subject': 'Deine Rücksendung {ref} ist genehmigt',
  'return.approved.heading': 'Deine Rücksendung ist genehmigt',
  'return.approved.l1':
    'Gute Nachrichten: Deine Rücksendung {ref} zur Bestellung {order} ist genehmigt.',
  'return.approved.l2':
    'So schickst du es zurück: Verpacke {list} wenn möglich in der Originalverpackung, schreib {ref} auf das Paket und schick es an Grocery Returns, Lindenstraße 1, 10115 Berlin (eine erfundene Adresse: Dies ist ein fiktiver Shop).',
  'return.approved.l3':
    'Sobald das Paket angekommen und geprüft ist, erstatten wir dir den Betrag und schreiben dir erneut.',
  'return.rejected.subject': 'Zu deiner Rücksendung {ref}',
  'return.rejected.heading': 'Wir konnten diese Rücksendung nicht annehmen',
  'return.rejected.l1':
    'Es tut uns leid: Wir konnten die Rücksendung {ref} zur Bestellung {order} nicht annehmen.',
  'return.rejected.reason': 'Grund: {reason}',
  'return.rejected.noReason': 'Schreib uns, wenn du mehr wissen möchtest.',
  'return.received.subject': 'Wir haben deine Rücksendung {ref} erhalten',
  'return.received.heading': 'Dein Paket ist angekommen',
  'return.received.l1': 'Deine Rücksendung {ref} zur Bestellung {order} ist angekommen: {list}.',
  'return.received.l2':
    'Wir bereiten deine Erstattung von {money} vor. Sobald sie veranlasst ist, erhältst du eine weitere E-Mail.',
  'return.refunded.subject': 'Deine Erstattung von {money} ist unterwegs',
  'return.refunded.heading': 'Deine Erstattung ist unterwegs',
  'return.refunded.l1':
    'Wir haben {money} für die Rücksendung {ref} (Bestellung {order}) erstattet.',
  'return.refunded.simulated':
    'Dies ist ein Demo-Shop: Die Erstattung wurde simuliert und es wurde kein Geld bewegt.',
  'return.refunded.real':
    'Sie erscheint in der Regel innerhalb weniger Tage auf deiner Karte, je nach Bank.',

  'news.unsub.text':
    'Du erhältst diese E-Mail, weil du die Grocery-News abonniert hast. Mit einem Klick abmelden: {url}',
  'news.unsub.lead': 'Du erhältst diese E-Mail, weil du die Grocery-News abonniert hast.',
  'news.unsub.link': 'Mit einem Klick abmelden',
  'news.confirm.subject': 'Bestätige dein Grocery-Abonnement',
  'news.confirm.l1':
    'Noch ein Schritt: Bitte bestätige, dass du Grocery-News und Angebote erhalten möchtest.',
  'news.confirm.link': 'Bestätigen: {url}',
  'news.confirm.button': 'Ja, anmelden',
  'news.confirm.hours': {
    one: 'Der Link ist {count} Stunde gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail und es wird dir nichts geschickt.',
    other:
      'Der Link ist {count} Stunden gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail und es wird dir nichts geschickt.',
  },
  'news.confirm.preheader': 'Bestätige deine Adresse, um deinen Willkommenscode zu erhalten',
  'news.confirm.heading': 'Bestätige dein Abonnement',
  'news.welcome.subject': 'Willkommen bei Grocery: {percent} % Rabatt auf deine erste Bestellung',
  'news.welcome.l1': 'Du bist dabei. Danke für deine Anmeldung.',
  'news.welcome.code': 'Dein Willkommenscode: {code}',
  'news.welcome.terms': {
    one: '{percent} % Rabatt auf deine erste Bestellung, einmal einlösbar, {count} Tag gültig.',
    other: '{percent} % Rabatt auf deine erste Bestellung, einmal einlösbar, {count} Tage gültig.',
  },
  'news.welcome.enter': 'Gib ihn im Warenkorb ein.',
  'news.welcome.preheader': 'Dein Willkommenscode über {percent} % ist drin',
  'news.welcome.heading': 'Willkommen im Rudel',

  'stock.subject': 'Wieder auf Lager: {product}',
  'stock.l1': 'Gute Nachrichten: {product} ({variant}) ist wieder auf Lager.',
  'stock.look': 'Jetzt ansehen: {url}',
  'stock.button': 'Im Shop ansehen',
  'stock.hurry': 'Der Bestand kann schnell weg sein, wir können dir leider keinen zurücklegen.',
  'stock.once': 'Du hast uns um diese eine E-Mail gebeten.',
  'stock.cancel': 'Nicht mehr interessiert?',
  'stock.preheader': '{product} ist wieder da',
  'stock.heading': 'Wieder auf Lager',

  'contact.topic.order': 'Meine Bestellung',
  'contact.topic.shipping': 'Versand und Lieferung',
  'contact.topic.returns': 'Rücksendungen und Erstattungen',
  'contact.topic.product': 'Ein Produkt',
  'contact.topic.account': 'Mein Konto',
  'contact.topic.privacy': 'Meine Daten und Datenschutz',
  'contact.topic.other': 'Etwas anderes',
  'contact.ack.subject': 'Wir haben deine Nachricht erhalten ({reference})',
  'contact.ack.l1':
    'Vielen Dank für deine Nachricht an Grocery. Eine Person antwortet an diese Adresse, in der Regel innerhalb von zwei Werktagen.',
  'contact.ack.reference': 'Referenz: {reference}',
  'contact.ack.topic': 'Thema: {topic}',
  'contact.ack.order': 'Bestellung: {order}',
  'contact.ack.yourMessage': 'Deine Nachricht:',
  'contact.ack.preheader': 'Wir haben deine Nachricht erhalten.',
  'contact.ack.heading': 'Wir haben deine Nachricht erhalten',

  'safety.recall': 'Produktrückruf: {title}',
  'safety.notice': 'Produktsicherheitshinweis: {title}',
  'safety.reason':
    'Du erhältst diese Nachricht, weil du ein betroffenes Produkt bei Grocery gekauft hast.',
  'review.subject': 'Deine Bewertung von {product} ist veröffentlicht',
  'review.l1':
    'Danke für deine Bewertung von {product}. Sie hat unsere Prüfung bestanden und steht jetzt auf der Produktseite, wo sie anderen Kundinnen und Kunden bei der Auswahl hilft.',
  'review.see': 'Hier ansehen: {url}',
  'review.link': 'Deine Bewertung ansehen',
  'review.preheader': 'Deine Bewertung von {product} ist veröffentlicht.',
  'review.heading': 'Danke für deine Bewertung.',
};
