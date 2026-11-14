import type { pets as enNs } from '../en/pets';
import type { Entry } from '../types';

export const pets: Record<keyof typeof enNs, Entry> = {
  // /account/pets
  'pets.title': 'Mes animaux',
  'pets.add': 'Ajouter un animal',
  'pets.intro':
    'Dites-nous pour qui vous achetez et la boutique affichera d’abord ce qui lui convient.',
  'pets.backToAccount': 'Retour à mon compte',
  'pets.guestNote': 'Vos animaux sont enregistrés dans ce navigateur.',
  'pets.signIn': 'Connectez-vous',
  'pets.signInRest': 'pour les retrouver sur tous vos appareils.',
  'pets.limit':
    'Vous avez {max} animaux, le maximum que nous puissions enregistrer. Supprimez-en un pour en ajouter un autre.',
  'pets.empty':
    'Aucun animal pour l’instant. Ajoutez-en un et la boutique commencera par la bonne nourriture, les bons jouets et les bonnes tailles.',
  'pets.shoppingFor': 'Achats pour',
  'pets.sizeSuffix': ', taille {size}',
  'pets.stopShopping': 'Arrêter les achats pour',
  'pets.shopFor': 'Acheter pour',
  'pets.edit': 'Modifier',
  'pets.delete': 'Supprimer',
  'pets.editTitle': 'Modifier l’animal',
  'pets.saved': 'Animal enregistré',
  'pets.added': '{name} ajouté',
  'pets.removeTitle': 'Retirer cet animal ?',
  'pets.removeText': '{name} sera retiré de vos animaux.',
  'pets.keep': 'Garder',
  'pets.remove': 'Retirer',
  'pets.removed': 'Animal retiré',

  // Species, sizes and ages
  'pets.species.dog': 'Chien',
  'pets.species.cat': 'Chat',
  'pets.species.bird': 'Oiseau',
  'pets.species.fish': 'Poisson',
  'pets.species.small': 'Petit animal',
  'pets.species.reptile': 'Reptile',
  'pets.size.xs': 'Très petit',
  'pets.size.s': 'Petit',
  'pets.size.m': 'Moyen',
  'pets.size.l': 'Grand',
  'pets.size.xl': 'Très grand',
  'pets.age.years': { one: '{count} an', other: '{count} ans' },
  'pets.age.months': { one: '{count} mois', other: '{count} mois' },

  // Pet form
  'pets.form.name': 'Nom',
  'pets.form.kind': 'Type d’animal',
  'pets.form.birthday': 'Date de naissance (facultatif)',
  'pets.form.age': 'Âge en mois (facultatif)',
  'pets.form.ageHint':
    'Si vous ne connaissez pas la date de naissance. Si les deux sont renseignés, nous utilisons la date de naissance.',
  'pets.form.size': 'Taille (facultatif)',
  'pets.form.sizeUnknown': 'Je ne sais pas',
  'pets.form.cancel': 'Annuler',
  'pets.form.save': 'Enregistrer l’animal',
  'pets.form.add': 'Ajouter l’animal',

  // Header switcher and the catalogue note
  'pets.switcher.shoppingFor': 'Achats pour {name}',
  'pets.switcher.shoppingForEveryone': 'Achats pour tous',
  'pets.switcher.addYours': 'Ajouter votre animal',
  'pets.switcher.everyone': 'Tous',
  'pets.switcher.add': 'Ajouter un animal',
  'pets.switcher.manage': 'Gérer les animaux',
  'pets.note.showing': 'Sélection adaptée à {name}.',
  'pets.note.showAll': 'Afficher tous les animaux',

  // Gift finder

  // Messages from outside (shared Zod rules)
  'msg.pets.required': 'Obligatoire',
  'msg.pets.birthdayFormat': 'Utilisez une date comme 2024-03-18',
  'msg.pets.birthdayFuture': 'Une date de naissance ne peut pas être dans le futur',
};
