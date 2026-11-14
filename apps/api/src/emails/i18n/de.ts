import type { TextEntry } from '@store/shared';

import type { EmailKey } from './en.ts';

// Deutsche E-Mail-Texte (Sie-Form). Dieselben Schlüssel und Platzhalter wie en.ts.
export const de: Record<EmailKey, TextEntry> = {
  'mail.footer':
    'Grocery ist ein fiktiver Demo-Shop für ein Portfolio. Nichts hier ist echt und keine Karte wurde belastet.',
  'mail.signoff': '- Ihr Grocery-Team',
  'mail.hello': 'Hallo {name},',
  'mail.seeOrder': 'Bestellung ansehen',
  'mail.orderLine': 'Bestellung: {url}',

  'order.qty': 'Menge {quantity}',
  'order.subtotal': 'Zwischensumme',
  'order.shipping': 'Versand ({method})',
  'order.discount': 'Rabatt',
  'order.donation': 'Spende an Whisker Hollow Rescue (Demo)',
  'order.total': 'Gesamtsumme',
  'order.shippingTo': 'Lieferadresse:',
  'order.deliveringTo': 'Wir liefern an:',

  'confirm.subject': 'Ihre Grocery-Bestellung {number} ist bestätigt',
  'confirm.thanks': 'Vielen Dank für Ihre Bestellung, {name}!',
  'confirm.paid': 'Die Bestellung {number} ist bezahlt und wir machen sie versandfertig.',
  'confirm.willEmail': 'Wir schreiben Ihnen noch einmal, sobald sie versendet wird.',
  'confirm.follow': 'Verfolgen Sie Ihre Bestellung jederzeit: {url}',
  'confirm.preheader': 'Bestellung {number} ist bestätigt.',
  'confirm.heading': 'Vielen Dank für Ihre Bestellung!',
  'confirm.intro':
    'Hallo {name}, die Bestellung {number} ist bezahlt und wir machen sie versandfertig.',
  'confirm.track': 'Bestellung verfolgen',
  'confirm.trackNote': '(Sie brauchen dafür die E-Mail-Adresse, mit der Sie bestellt haben).',

  'shipped.subject': 'Ihre Grocery-Bestellung {number} ist unterwegs',
  'shipped.good': 'Gute Nachrichten, {name}: Die Bestellung {number} wurde versendet!',
  'shipped.method': 'Versandart: {method}',
  'shipped.preheader': 'Bestellung {number} wurde versendet.',
  'shipped.heading': 'Ihre Bestellung ist unterwegs!',
  'shipped.intro': 'Hallo {name}, die Bestellung {number} wurde mit {method} versendet.',

  'withdrawal.subject': 'Wir haben Ihren Widerruf zur Bestellung {number} erhalten',
  'withdrawal.body':
    'Diese E-Mail bestätigt, dass wir am {when} Ihre Erklärung zum Widerruf des Vertrags über die Bestellung {number} erhalten haben.',
  'withdrawal.reference': 'Referenz: {reference}',
  'withdrawal.covers': 'Betrifft: {scope}',
  'withdrawal.wholeOrder': 'die gesamte Bestellung',
  'withdrawal.reason': 'Ihr angegebener Grund: {reason}',
  'withdrawal.next':
    'Wir melden uns mit den nächsten Schritten. Bewahren Sie diese E-Mail als Nachweis auf.',
  'withdrawal.preheader': 'Widerruf zur Bestellung {number} erhalten.',
  'withdrawal.heading': 'Wir haben Ihren Widerruf erhalten',

  'return.requested.subject': 'Wir haben Ihre Rücksendeanfrage zur Bestellung {order} erhalten',
  'return.requested.heading': 'Wir haben Ihre Rücksendeanfrage erhalten',
  'return.requested.l1':
    'Danke, Ihre Anfrage ({ref}) zur Bestellung {order} ist bei uns. Jemand sieht sie sich bald an und teilt Ihnen den nächsten Schritt per E-Mail mit.',
  'return.requested.l2': 'Sie möchten zurücksenden: {list}.',
  'return.approved.subject': 'Ihre Rücksendung {ref} ist genehmigt',
  'return.approved.heading': 'Ihre Rücksendung ist genehmigt',
  'return.approved.l1':
    'Gute Nachrichten: Ihre Rücksendung {ref} zur Bestellung {order} ist genehmigt.',
  'return.approved.l2':
    'So senden Sie zurück: Verpacken Sie {list} wenn möglich in der Originalverpackung, schreiben Sie {ref} auf das Paket und schicken Sie es an Grocery Returns, 1 Bone Street, Riga LV-1010 (eine erfundene Adresse: Dies ist ein Demo-Shop).',
  'return.approved.l3':
    'Sobald das Paket angekommen und geprüft ist, erstatten wir Ihnen den Betrag und schreiben Ihnen erneut.',
  'return.rejected.subject': 'Zu Ihrer Rücksendung {ref}',
  'return.rejected.heading': 'Wir konnten diese Rücksendung nicht annehmen',
  'return.rejected.l1':
    'Es tut uns leid: Wir konnten die Rücksendung {ref} zur Bestellung {order} nicht annehmen.',
  'return.rejected.reason': 'Grund: {reason}',
  'return.rejected.noReason': 'Schreiben Sie uns, wenn Sie mehr wissen möchten.',
  'return.received.subject': 'Wir haben Ihre Rücksendung {ref} erhalten',
  'return.received.heading': 'Ihr Paket ist angekommen',
  'return.received.l1': 'Ihre Rücksendung {ref} zur Bestellung {order} ist angekommen: {list}.',
  'return.received.l2':
    'Wir bereiten Ihre Erstattung von {money} vor. Sobald sie veranlasst ist, erhalten Sie eine weitere E-Mail.',
  'return.refunded.subject': 'Ihre Erstattung von {money} ist unterwegs',
  'return.refunded.heading': 'Ihre Erstattung ist unterwegs',
  'return.refunded.l1':
    'Wir haben {money} für die Rücksendung {ref} (Bestellung {order}) erstattet.',
  'return.refunded.simulated':
    'Dies ist ein Demo-Shop: Die Erstattung wurde simuliert und es wurde kein Geld bewegt.',
  'return.refunded.real':
    'Sie erscheint in der Regel innerhalb weniger Tage auf Ihrer Karte, je nach Bank.',

  'news.unsub.text':
    'Sie erhalten diese E-Mail, weil Sie die Grocery-News abonniert haben. Mit einem Klick abmelden: {url}',
  'news.unsub.lead': 'Sie erhalten diese E-Mail, weil Sie die Grocery-News abonniert haben.',
  'news.unsub.link': 'Mit einem Klick abmelden',
  'news.confirm.subject': 'Bestätigen Sie Ihr Grocery-Abonnement',
  'news.confirm.l1':
    'Noch ein Schritt: Bitte bestätigen Sie, dass Sie Grocery-News, Angebote und Haustier-Tipps erhalten möchten.',
  'news.confirm.link': 'Bestätigen: {url}',
  'news.confirm.button': 'Ja, anmelden',
  'news.confirm.hours': {
    one: 'Der Link ist {count} Stunde gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail und es wird Ihnen nichts geschickt.',
    other:
      'Der Link ist {count} Stunden gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail und es wird Ihnen nichts geschickt.',
  },
  'news.confirm.preheader': 'Bestätigen Sie Ihre Adresse, um Ihren Willkommenscode zu erhalten',
  'news.confirm.heading': 'Bestätigen Sie Ihr Abonnement',
  'news.welcome.subject': 'Willkommen bei Grocery: {percent} % Rabatt auf Ihre erste Bestellung',
  'news.welcome.l1': 'Sie sind dabei. Danke für Ihre Anmeldung!',
  'news.welcome.code': 'Ihr Willkommenscode: {code}',
  'news.welcome.terms': {
    one: '{percent} % Rabatt auf Ihre erste Bestellung, einmal einlösbar, {count} Tag gültig.',
    other: '{percent} % Rabatt auf Ihre erste Bestellung, einmal einlösbar, {count} Tage gültig.',
  },
  'news.welcome.enter': 'Geben Sie ihn im Warenkorb ein.',
  'news.welcome.preheader': 'Ihr Willkommenscode über {percent} % ist drin',
  'news.welcome.heading': 'Willkommen im Rudel',

  'stock.subject': 'Wieder auf Lager: {product}',
  'stock.l1': 'Gute Nachrichten: {product} ({variant}) ist wieder auf Lager.',
  'stock.look': 'Jetzt ansehen: {url}',
  'stock.button': 'Im Shop ansehen',
  'stock.hurry': 'Der Bestand kann schnell weg sein, wir können Ihnen leider keinen zurücklegen.',
  'stock.once': 'Sie haben uns um diese eine E-Mail gebeten.',
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
  'contact.ack.subject': 'Wir haben Ihre Nachricht erhalten ({reference})',
  'contact.ack.l1':
    'Vielen Dank für Ihre Nachricht an Grocery. Eine Person antwortet an diese Adresse, in der Regel innerhalb von zwei Werktagen.',
  'contact.ack.reference': 'Referenz: {reference}',
  'contact.ack.topic': 'Thema: {topic}',
  'contact.ack.order': 'Bestellung: {order}',
  'contact.ack.yourMessage': 'Ihre Nachricht:',
  'contact.ack.preheader': 'Wir haben Ihre Nachricht erhalten.',
  'contact.ack.heading': 'Wir haben Ihre Nachricht erhalten',

  'safety.recall': 'Produktrückruf: {title}',
  'safety.notice': 'Produktsicherheitshinweis: {title}',
  'safety.reason':
    'Sie erhalten diese Nachricht, weil Sie ein betroffenes Produkt bei Grocery gekauft haben.',
  'review.subject': 'Ihre Bewertung von {product} ist veröffentlicht',
  'review.l1':
    'Vielen Dank für Ihre Bewertung von {product}! Sie hat unsere Prüfung bestanden und steht jetzt auf der Produktseite, wo sie anderen Tierhaltern bei der Auswahl hilft.',
  'review.see': 'Hier ansehen: {url}',
  'review.link': 'Ihre Bewertung ansehen',
  'review.preheader': 'Ihre Bewertung von {product} ist veröffentlicht.',
  'review.heading': 'Vielen Dank für Ihre Bewertung!',
};
