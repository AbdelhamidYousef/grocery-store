import type { pets as enNs } from '../en/pets';
import type { Entry } from '../types';

export const pets: Record<keyof typeof enNs, Entry> = {
  // /account/pets
  'pets.title': 'Meine Haustiere',
  'pets.add': 'Haustier hinzufügen',
  'pets.intro': 'Verraten Sie uns, für wen Sie einkaufen, und der Shop zeigt zuerst, was passt.',
  'pets.backToAccount': 'Zurück zu meinem Konto',
  'pets.guestNote': 'Ihre Haustiere werden in diesem Browser gespeichert.',
  'pets.signIn': 'Melden Sie sich an,',
  'pets.signInRest': 'um sie auf allen Geräten zu behalten.',
  'pets.limit':
    'Sie haben {max} Haustiere, mehr können wir nicht speichern. Entfernen Sie eines, um ein neues hinzuzufügen.',
  'pets.empty':
    'Noch keine Haustiere. Fügen Sie eines hinzu, und der Shop beginnt mit dem passenden Futter, Spielzeug und den richtigen Größen.',
  'pets.shoppingFor': 'Einkauf für',
  'pets.sizeSuffix': ', Größe {size}',
  'pets.stopShopping': 'Nicht mehr einkaufen für',
  'pets.shopFor': 'Einkaufen für',
  'pets.edit': 'Bearbeiten',
  'pets.delete': 'Löschen',
  'pets.editTitle': 'Haustier bearbeiten',
  'pets.saved': 'Haustier gespeichert',
  'pets.added': '{name} hinzugefügt',
  'pets.removeTitle': 'Dieses Haustier entfernen?',
  'pets.removeText': '{name} wird aus Ihren Haustieren entfernt.',
  'pets.keep': 'Behalten',
  'pets.remove': 'Entfernen',
  'pets.removed': 'Haustier entfernt',

  // Species, sizes and ages
  'pets.species.dog': 'Hund',
  'pets.species.cat': 'Katze',
  'pets.species.bird': 'Vogel',
  'pets.species.fish': 'Fisch',
  'pets.species.small': 'Kleintier',
  'pets.species.reptile': 'Reptil',
  'pets.size.xs': 'Extra klein',
  'pets.size.s': 'Klein',
  'pets.size.m': 'Mittel',
  'pets.size.l': 'Groß',
  'pets.size.xl': 'Extra groß',
  'pets.age.years': { one: '{count} Jahr', other: '{count} Jahre' },
  'pets.age.months': { one: '{count} Monat', other: '{count} Monate' },

  // Pet form
  'pets.form.name': 'Name',
  'pets.form.kind': 'Tierart',
  'pets.form.birthday': 'Geburtstag (optional)',
  'pets.form.age': 'Alter in Monaten (optional)',
  'pets.form.ageHint':
    'Falls Sie den Geburtstag nicht kennen. Wenn beides angegeben ist, verwenden wir den Geburtstag.',
  'pets.form.size': 'Größe (optional)',
  'pets.form.sizeUnknown': 'Nicht sicher',
  'pets.form.cancel': 'Abbrechen',
  'pets.form.save': 'Haustier speichern',
  'pets.form.add': 'Haustier hinzufügen',

  // Header switcher and the catalogue note
  'pets.switcher.shoppingFor': 'Einkauf für {name}',
  'pets.switcher.shoppingForEveryone': 'Einkauf für alle',
  'pets.switcher.addYours': 'Ihr Haustier hinzufügen',
  'pets.switcher.everyone': 'Alle',
  'pets.switcher.add': 'Haustier hinzufügen',
  'pets.switcher.manage': 'Haustiere verwalten',
  'pets.note.showing': 'Angezeigt wird, was zu {name} passt.',
  'pets.note.showAll': 'Alle Haustiere anzeigen',

  // Gift finder

  // Messages from outside (shared Zod rules)
  'msg.pets.required': 'Pflichtfeld',
  'msg.pets.birthdayFormat': 'Verwenden Sie ein Datum wie 2024-03-18',
  'msg.pets.birthdayFuture': 'Ein Geburtstag kann nicht in der Zukunft liegen',
};
