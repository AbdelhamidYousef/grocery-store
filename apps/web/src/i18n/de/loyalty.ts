import type { loyalty as enNs } from '../en/loyalty';
import type { Entry } from '../types';

export const loyalty: Record<keyof typeof enNs, Entry> = {
  // Checkout: pay with points
  'loyalty.redeem.title': 'Treuepunkte einlösen',
  'loyalty.redeem.balance': 'Du hast {balance} Punkte (Wert: {worth}).',
  'loyalty.redeem.rate': '100 Punkte = {amount} Rabatt auf deine Artikel.',
  'loyalty.redeem.minimum': 'Mindestens {amount} zahlst du immer per Karte.',
  'loyalty.redeem.useMax': 'Maximum nutzen ({max})',
  'loyalty.redeem.clear': 'Zurücksetzen',
  'loyalty.redeem.applied': '{points} Punkte = {amount} Rabatt',

  // Earn points (product page, cart)
  'loyalty.earn.signInLink': 'Anmelden und',
  'loyalty.earn.signInRest': 'Treuepunkte für diese Bestellung sammeln.',
  'loyalty.earn.points': { one: '{count} Punkt sammeln', other: '{count} Punkte sammeln' },

  // Footer note and charity page
  'loyalty.charityNote.text':
    '(eine erfundene Tafel) hat bisher {amount} erhalten. Nur eine Demo: Es fließt kein Geld.',
  'loyalty.charity.seoTitle': 'Unsere Tafel',
  'loyalty.charity.seoDescription':
    'Spreeufer Food Bank, die (fiktive) Tafel, die Grocery unterstützt. Eine Demo: Es fließt kein Geld.',
  'loyalty.charity.note':
    'Dies ist ein Demo-Shop und die Tafel ist erfunden. Spenden werden hier gezählt, aber es fließt nirgendwohin Geld.',
  'loyalty.charity.error': 'Die Summe konnte gerade nicht geladen werden.',
  'loyalty.charity.given': 'Bisher gespendet',
  'loyalty.charity.donations': { one: 'aus {count} Spende', other: 'aus {count} Spenden' },
  'loyalty.charity.waysTitle': 'Zwei Wege zu helfen',
  'loyalty.charity.checkoutLabel': 'Beim Bezahlen:',
  'loyalty.charity.checkoutText':
    'Setze ein Häkchen bei „Aufrunden“, und der Gesamtbetrag wird auf den nächsten vollen Euro erhöht. Der Aufschlag erscheint als eigene Zeile in deiner Bestellung und wird nie rabattiert.',
  'loyalty.charity.pointsLabel': 'Mit Punkten:',
  'loyalty.charity.pointsText': 'Spende beliebig viele deiner Treuepunkte (1 Punkt = 1 Cent)',
  'loyalty.charity.pointsOnYour': 'auf deiner',
  'loyalty.charity.rewardsPage': 'Prämienseite',
  'loyalty.charity.pointsOnceYou': 'sobald du dich',
  'loyalty.charity.signIn': 'anmeldest',
  'loyalty.charity.roundUpNote':
    'Ein Aufrundungsbetrag wird gezählt, sobald die Bestellung bezahlt ist, und zurückgebucht, wenn die Bestellung erstattet wird.',

  // Referral panel
  'loyalty.referral.title': 'Freunde werben',
  'loyalty.referral.how':
    'Teile deinen Link. Wenn ein Freund ein Konto erstellt und seine erste Bestellung ab {min} bezahlt, bekommt ihr beide einen Code über {reward} (gültig {days} Tage, für eine Bestellung ab {min}).',
  'loyalty.referral.copy': 'Link kopieren',
  'loyalty.referral.copied': 'Kopiert',
  'loyalty.referral.linkCopied': 'Link kopiert',
  'loyalty.referral.stats':
    '{qualified} belohnt, {pending} warten auf eine erste Bestellung. Bis zu {max} pro Jahr.',
  'loyalty.referral.statsRejected':
    '{qualified} belohnt, {pending} warten auf eine erste Bestellung, {rejected} nicht berechtigt. Bis zu {max} pro Jahr.',

  // /account/rewards
  'loyalty.rewards.title': 'Prämien',
  'loyalty.rewards.pointsError': 'Deine Punkte konnten nicht geladen werden.',
  'loyalty.rewards.retry': 'Erneut versuchen',
  'loyalty.rewards.balance': 'Dein Punktestand',
  'loyalty.rewards.pointsUnit': 'Punkte',
  'loyalty.rewards.worth': 'An der Kasse {amount} wert',
  'loyalty.rewards.earnRateOne': 'Du erhältst 1 Punkt pro ausgegebenem Euro.',
  'loyalty.rewards.earnRatePercent': 'Du erhältst {percent} % pro ausgegebenem Euro.',
  'loyalty.rewards.nextTier': 'Noch {points} verdiente Punkte bis {label}.',
  'loyalty.rewards.topTier': 'Du bist in der höchsten Stufe.',
  'loyalty.rewards.spendTitle': 'Punkte ausgeben',
  'loyalty.rewards.rewardsError': 'Die Prämien konnten nicht geladen werden.',
  'loyalty.rewards.noRewards': 'Derzeit sind keine Prämien verfügbar.',
  'loyalty.rewards.cost': '{points} Punkte',
  'loyalty.rewards.redeem.button': 'Einlösen',
  'loyalty.rewards.redeem.morePoints': 'Noch {short} Punkte',
  'loyalty.rewards.redeem.for': 'für {name}',
  'loyalty.rewards.redeem.code': 'Dein Code lautet {code}',
  'loyalty.rewards.redeem.failed': 'Das konnte nicht eingelöst werden.',
  'loyalty.rewards.giveAwayTitle': 'Oder verschenken',
  'loyalty.rewards.donate.giveTo': 'Punkte spenden an',
  'loyalty.rewards.donate.aboutShelter':
    ', eine erfundene Tafel (1 Punkt = 1 Cent; nur Demo, es fließt kein Geld).',
  'loyalty.rewards.donate.label': 'Zu spendende Punkte',
  'loyalty.rewards.donate.button': 'Spenden',
  'loyalty.rewards.donate.thanks': 'Danke. {points} Punkte gingen an die Tafel.',
  'loyalty.rewards.donate.failed': 'Das konnte nicht gespendet werden.',
  'loyalty.rewards.codesTitle': 'Deine Codes',
  'loyalty.rewards.codesEmpty':
    'Codes, die du mit Punkten kaufst, erscheinen hier. Wende einen im Warenkorb an.',
  'loyalty.rewards.code.freeDelivery': 'Kostenlose Lieferung',
  'loyalty.rewards.code.fixedOff': '{amount} Rabatt',
  'loyalty.rewards.code.percentOff': '{percent} % Rabatt',
  'loyalty.rewards.code.minSpend': ', Mindestbestellwert {amount}',
  'loyalty.rewards.code.used': 'Eingelöst',
  'loyalty.rewards.code.validUntil': 'Gültig bis {date}',
  'loyalty.rewards.code.noExpiry': 'Unbegrenzt gültig',
  'loyalty.rewards.historyTitle': 'Punkteverlauf',
  'loyalty.rewards.historyEmpty':
    'Noch keine Punkte. Jeder Euro, den du für eine Bestellung ausgibst, bringt Punkte.',
  'loyalty.rewards.historyCaption': 'Deine letzten 50 Punktebewegungen',
  'loyalty.rewards.colDate': 'Datum',
  'loyalty.rewards.colWhat': 'Vorgang',
  'loyalty.rewards.colPoints': 'Punkte',
  'loyalty.rewards.kind.earn': 'Gesammelt',
  'loyalty.rewards.kind.redeem': 'Ausgegeben',
  'loyalty.rewards.kind.reversal': 'Zurückgegeben oder zurückgebucht',
  'loyalty.rewards.kind.bonus': 'Bonus',
  'loyalty.rewards.kind.donate': 'Gespendet',
  'loyalty.rewards.kind.adjust': 'Korrektur',

  // Wishlist
  'loyalty.wishlist.title': 'Deine Wunschliste',
  'loyalty.wishlist.saveLabel': '{name} auf die Wunschliste setzen',
  'loyalty.wishlist.saved': '{name} wurde auf deine Wunschliste gesetzt',
  'loyalty.wishlist.updateFailed':
    'Deine Wunschliste konnte nicht aktualisiert werden. Bitte versuche es erneut.',
  'loyalty.wishlist.moveToCart': 'In den Warenkorb',
  'loyalty.wishlist.soldOut': 'Ausverkauft',
  'loyalty.wishlist.remove': 'Entfernen',
  'loyalty.wishlist.error': 'Deine Wunschliste konnte gerade nicht geladen werden.',
  'loyalty.wishlist.empty':
    'Noch nichts gespeichert. Tippe bei einem Produkt auf das Herz, um es hier zu merken.',
  'loyalty.wishlist.keepBrowsing': 'Weiter stöbern',
  'loyalty.wishlist.shareTitle': 'Wunschliste teilen',
  'loyalty.wishlist.shareText':
    'Jeder mit dem Link sieht diese Artikel und deinen Vornamen, sonst nichts. Wenn du das Teilen beendest, funktioniert der Link nicht mehr.',
  'loyalty.wishlist.stopSharing': 'Teilen beenden',
  'loyalty.wishlist.createLink': 'Link zum Teilen erstellen',
  'loyalty.wishlist.signIn': 'Melde dich an,',
  'loyalty.wishlist.signInRest':
    'um deine Liste zu teilen. Deine gespeicherten Artikel bleiben erhalten.',
  'loyalty.wishlist.sharedTitle': 'Eine geteilte Wunschliste',
  'loyalty.wishlist.ownerTitle': 'Wunschliste von {name}',
  'loyalty.wishlist.sharedEmpty': 'Derzeit steht nichts auf dieser Liste.',

  // Newsletter
  'loyalty.newsletter.seoTitle': 'Newsletter',
  'loyalty.newsletter.seoDescription': 'Angebote und Neuigkeiten von Grocery.',
  'loyalty.newsletter.pageTitle': 'Angebote per E-Mail erhalten',
  'loyalty.newsletter.pageText':
    'Abonniere den Newsletter und erhalte 10 % Rabatt auf deine erste Bestellung, sobald du deine Adresse bestätigt hast.',
  'loyalty.newsletter.slotTitle': '10 % Rabatt auf deine erste Bestellung',
  'loyalty.newsletter.slotText':
    'Neuigkeiten und hin und wieder ein Angebot. Zuerst schicken wir einen Bestätigungslink, und jede Nachricht lässt sich mit einem Klick abbestellen. Lies die',
  'loyalty.newsletter.privacyLink': 'Datenschutzerklärung',
  'loyalty.newsletter.email': 'E-Mail',
  'loyalty.newsletter.interests': 'Welche Abteilungen interessieren dich?',
  'loyalty.newsletter.consent':
    'Schick mir Grocery-News und Angebote. Ich kann mich jederzeit mit einem Klick abmelden.',
  'loyalty.newsletter.consentRequired': 'Bitte setze das Häkchen, um zu abonnieren',
  'loyalty.newsletter.honeypot': 'Bitte leer lassen',
  'loyalty.newsletter.submit': 'Abonnieren und 10 % Rabatt sichern',
  'loyalty.newsletter.done':
    'Fast geschafft. Wenn diese Adresse E-Mails empfangen kann, ist ein Bestätigungslink unterwegs. Klicke darauf, dann folgt dein Willkommenscode.',
  'loyalty.newsletter.tooMany': 'Zu viele Anmeldungen von hier. Bitte versuche es später erneut.',
  'loyalty.newsletter.failed':
    'Die Anmeldung war gerade nicht möglich. Bitte versuche es gleich noch einmal.',
  'loyalty.newsletter.token.incomplete':
    'Dieser Link ist unvollständig. Bitte öffne ihn erneut über die E-Mail.',
  'loyalty.newsletter.token.working': 'Wird bearbeitet',
  'loyalty.newsletter.token.expired': 'Dieser Link ist abgelaufen.',
  'loyalty.newsletter.token.invalid': 'Dieser Link ist nicht mehr gültig.',
  'loyalty.newsletter.token.signUpAgain': 'Erneut anmelden',
  'loyalty.newsletter.confirm.title': 'Abonnement bestätigen',
  'loyalty.newsletter.confirm.already':
    'Du hast den Newsletter bereits abonniert. Deinen Willkommenscode findest du in der E-Mail, die wir gesendet haben.',
  'loyalty.newsletter.confirm.done':
    'Du bist angemeldet. Wir haben dir gerade deinen Willkommenscode über 10 % per E-Mail geschickt.',
  'loyalty.newsletter.unsubscribe.title': 'Abbestellen',
  'loyalty.newsletter.unsubscribe.done':
    'Du bist abgemeldet. Wir senden dir keine Neuigkeiten mehr.',

  // Stock alerts
  'loyalty.stockAlerts.title': 'Per E-Mail benachrichtigen, wenn wieder da',
  'loyalty.stockAlerts.email': 'E-Mail',
  'loyalty.stockAlerts.submit': 'Benachrichtigen',
  'loyalty.stockAlerts.done':
    'Alles klar. Wir schreiben an {email} einmal, sobald der Artikel wieder da ist.',
  'loyalty.stockAlerts.inStock': 'Der Artikel ist gerade verfügbar: Lade die Seite neu.',
  'loyalty.stockAlerts.limit': 'Du kannst auf höchstens 5 Artikel gleichzeitig warten.',
  'loyalty.stockAlerts.tooMany': 'Zu viele Anfragen. Bitte versuche es später erneut.',
  'loyalty.stockAlerts.failed': 'Das konnte nicht gespeichert werden. Bitte versuche es erneut.',
  'loyalty.stockAlerts.cancel.title': 'Verfügbarkeitsbenachrichtigung',
  'loyalty.stockAlerts.cancel.done': 'Erledigt: Wir schreiben dir nicht mehr zu diesem Artikel.',

  // Messages from outside (shared Zod rules)
  'msg.loyalty.emailInvalid': 'Gib eine gültige E-Mail-Adresse ein',
};
