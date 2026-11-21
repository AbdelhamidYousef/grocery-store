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
};
