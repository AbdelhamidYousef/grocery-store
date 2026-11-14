import type { Dictionary } from '../types';

export const pets = {
  // /account/pets
  'pets.title': 'My pets',
  'pets.add': 'Add a pet',
  'pets.intro': 'Tell us who you shop for and the store shows what suits them first.',
  'pets.backToAccount': 'Back to my account',
  'pets.guestNote': 'Your pets are saved in this browser.',
  'pets.signIn': 'Sign in',
  'pets.signInRest': 'to keep them on every device.',
  'pets.limit': 'You have {max} pets, the most we can keep. Remove one to add another.',
  'pets.empty': 'No pets yet. Add one and the shop will start with the right food, toys and sizes.',
  'pets.shoppingFor': 'Shopping for',
  'pets.sizeSuffix': ', size {size}',
  'pets.stopShopping': 'Stop shopping for',
  'pets.shopFor': 'Shop for',
  'pets.edit': 'Edit',
  'pets.delete': 'Delete',
  'pets.editTitle': 'Edit pet',
  'pets.saved': 'Pet saved',
  'pets.added': '{name} added',
  'pets.removeTitle': 'Remove this pet?',
  'pets.removeText': '{name} will be removed from your pets.',
  'pets.keep': 'Keep',
  'pets.remove': 'Remove',
  'pets.removed': 'Pet removed',

  // Species, sizes and ages
  'pets.species.dog': 'Dog',
  'pets.species.cat': 'Cat',
  'pets.species.bird': 'Bird',
  'pets.species.fish': 'Fish',
  'pets.species.small': 'Small pet',
  'pets.species.reptile': 'Reptile',
  'pets.size.xs': 'Extra small',
  'pets.size.s': 'Small',
  'pets.size.m': 'Medium',
  'pets.size.l': 'Large',
  'pets.size.xl': 'Extra large',
  'pets.age.years': { one: '{count} year', other: '{count} years' },
  'pets.age.months': { one: '{count} month', other: '{count} months' },

  // Pet form
  'pets.form.name': 'Name',
  'pets.form.kind': 'Kind of pet',
  'pets.form.birthday': 'Birthday (optional)',
  'pets.form.age': 'Age in months (optional)',
  'pets.form.ageHint': 'If you do not know the birthday. We use the birthday when both are given.',
  'pets.form.size': 'Size (optional)',
  'pets.form.sizeUnknown': 'Not sure',
  'pets.form.cancel': 'Cancel',
  'pets.form.save': 'Save pet',
  'pets.form.add': 'Add pet',

  // Header switcher and the catalogue note
  'pets.switcher.shoppingFor': 'Shopping for {name}',
  'pets.switcher.shoppingForEveryone': 'Shopping for everyone',
  'pets.switcher.addYours': 'Add your pet',
  'pets.switcher.everyone': 'Everyone',
  'pets.switcher.add': 'Add a pet',
  'pets.switcher.manage': 'Manage pets',
  'pets.note.showing': 'Showing what suits {name}.',
  'pets.note.showAll': 'Show all pets',

  // Gift finder

  // Messages from outside (shared Zod rules)
  'msg.pets.required': 'Required',
  'msg.pets.birthdayFormat': 'Use a date like 2024-03-18',
  'msg.pets.birthdayFuture': 'A birthday cannot be in the future',
} satisfies Dictionary;
