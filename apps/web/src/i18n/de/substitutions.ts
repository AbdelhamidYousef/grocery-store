import type { substitutions as enNs } from '../en/substitutions';
import type { Entry } from '../types';

export const substitutions: Record<keyof typeof enNs, Entry> = {
  'subs.label': 'Falls es fehlt',
  'subs.option.best_match': 'Beste Alternative',
  'subs.option.specific': 'Produkt wählen',
  'subs.option.none': 'Erstatten',
  'subs.hint.best_match':
    'Wir wählen eine passende Alternative zu etwa dem gleichen Preis. Du zahlst nie mehr als für das Original.',
  'subs.hint.none': 'Wir lassen es weg und berechnen es dir nicht.',
  'subs.chosen': 'Stattdessen: {name}.',
  'subs.change': 'Ändern',
  'subs.all.label': 'Für alle Artikel gleich:',
  'subs.toast.all': 'Für alle Artikel in deinem Warenkorb gespeichert.',
  'subs.pick.title': '{name} ersetzen durch',
  'subs.pick.intro':
    'Diese Produkte sind sicher: keine neuen Allergene, dieselben Ernährungsformen, etwa der gleiche Preis und jetzt auf Lager.',
  'subs.pick.choose': 'Wählen',
  'subs.pick.empty': 'Gerade ist nichts Passendes auf Lager. Wenn es fehlt, erstatten wir es dir.',
  'subs.pick.error': 'Wir konnten die Produkte nicht laden. Versuch es noch einmal.',
  'subs.account.heading': 'Falls etwas fehlt',
  'subs.account.intro':
    'Neue Artikel in deinem Warenkorb starten mit dieser Wahl. Du kannst jeden einzeln ändern.',
  'subs.account.save': 'Speichern',
  'subs.account.saved': 'Gespeichert.',
  'subs.order.heading': 'Änderungen an deiner Bestellung',
  'subs.order.intro':
    'Etwas war nicht im Regal. Hier siehst du, was wir getan haben und was du zahlst.',
  'subs.order.missing': 'Nicht vorrätig.',
  'subs.order.short': 'Wir haben {picked} von {quantity} gefunden. Du zahlst für {picked}.',
  'subs.order.notCharged': 'Was fehlt, berechnen wir dir nicht.',
  'subs.order.instead': 'Ersatz',
  'subs.order.priceEach': '{quantity} x {price} je Stück',
  'subs.order.save': 'Du sparst {amount}',
  'subs.order.accept': 'Annehmen',
  'subs.order.reject': 'Ablehnen',
  'subs.order.unanswered':
    'Antwortest du nicht, behalten wir den Ersatz, wenn wir deine Bestellung losschicken.',
  'subs.order.accepted': 'Angenommen.',
  'subs.order.atDoor':
    'Wenn du ihn an der Tür nicht willst, sag es dem Fahrer und wir erstatten ihn.',
  'subs.order.rejected': 'Abgelehnt. Du zahlst nichts dafür.',
  'subs.order.refused': 'An der Tür abgelehnt. Wir haben {amount} erstattet.',
  'subs.order.answerClosed':
    'Die Tasche ist unterwegs. Sag es dem Fahrer an der Tür, wenn du den Ersatz nicht willst.',
  'subs.order.answerError': 'Wir konnten deine Antwort nicht speichern. Versuch es noch einmal.',
  'subs.order.replaces': 'Ersetzt {name}',
  'subs.order.foundOf': '{picked} von {quantity}',
  'subs.order.notChargedShort': 'Nicht berechnet',
  'subs.order.changedOnTracking':
    'An dieser Bestellung hat sich etwas geändert. Antworte über den Link in unserer E-Mail oder melde dich in deinem Konto an.',
  'subs.link.title': 'Dein Ersatz',
  'subs.link.intro.accept':
    'Du behältst gleich den Ersatz. Wir berechnen ihn zu dem Preis, den wir dir genannt haben, nie über dem Original.',
  'subs.link.intro.reject':
    'Du lehnst gleich den Ersatz ab. Wir nehmen ihn heraus und berechnen ihn dir nicht.',
  'subs.link.confirm.accept': 'Ersatz annehmen',
  'subs.link.confirm.reject': 'Ersatz ablehnen',
  'subs.link.done.accept': 'Erledigt. Wir behalten den Ersatz.',
  'subs.link.done.reject': 'Erledigt. Wir nehmen den Ersatz heraus und berechnen ihn dir nicht.',
  'subs.link.error.gone': 'Dieser Link funktioniert nicht mehr.',
  'subs.link.error.closed':
    'Die Tasche ist unterwegs, deshalb lässt sich das hier nicht mehr ändern. Sag es dem Fahrer an der Tür.',
  'subs.link.error.generic': 'Wir konnten deine Antwort nicht speichern. Versuch es noch einmal.',
  'subs.link.shop': 'Zurück zum Shop',
  'subs.track.replacement': 'Ersatz: {quantity} x {name} ({status}).',
  'subs.track.status.proposed': 'wartet auf deine Antwort',
  'subs.track.status.accepted': 'angenommen',
  'subs.track.status.rejected': 'abgelehnt',
};
