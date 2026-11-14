import type { GiftKey } from '@store/shared';

import type { StringKey } from '../../i18n';

// The quiz questions live in `@store/shared` in English (the API and the scoring use their keys and
// values). This file maps each question and answer to a dictionary key, so the wizard shows them
// in the store's language; a value without an entry falls back to the English label.
export const QUESTION_KEYS: Record<GiftKey, { title: StringKey; hint?: StringKey }> = {
  pet: { title: 'pets.gift.q.pet.title' },
  age: { title: 'pets.gift.q.age.title', hint: 'pets.gift.q.age.hint' },
  budget: { title: 'pets.gift.q.budget.title' },
  goal: { title: 'pets.gift.q.goal.title' },
};

export const OPTION_KEYS: Record<string, StringKey> = {
  'pet.dog': 'pets.gift.q.pet.dog',
  'pet.cat': 'pets.gift.q.pet.cat',
  'pet.bird': 'pets.gift.q.pet.bird',
  'pet.fish': 'pets.gift.q.pet.fish',
  'pet.small': 'pets.gift.q.pet.small',
  'pet.reptile': 'pets.gift.q.pet.reptile',
  'pet.any': 'pets.gift.q.pet.any',
  'age.young': 'pets.gift.q.age.young',
  'age.adult': 'pets.gift.q.age.adult',
  'age.senior': 'pets.gift.q.age.senior',
  'age.any': 'pets.gift.q.age.any',
  'budget.0': 'pets.gift.q.budget.none',
  'goal.play': 'pets.gift.q.goal.play',
  'goal.comfort': 'pets.gift.q.goal.comfort',
  'goal.walks': 'pets.gift.q.goal.walks',
  'goal.treats': 'pets.gift.q.goal.treats',
};

// "Gift ideas for {pet}": the pet as a noun phrase, without the article of the quiz label.
export const PET_WORD_KEYS: Record<string, StringKey> = {
  dog: 'pets.gift.petWord.dog',
  cat: 'pets.gift.petWord.cat',
  bird: 'pets.gift.petWord.bird',
  fish: 'pets.gift.petWord.fish',
  small: 'pets.gift.petWord.small',
  reptile: 'pets.gift.petWord.reptile',
  any: 'pets.gift.petWord.any',
};

export const GOAL_KEYS: Record<string, StringKey> = {
  play: 'pets.gift.goal.play',
  comfort: 'pets.gift.goal.comfort',
  walks: 'pets.gift.goal.walks',
  treats: 'pets.gift.goal.treats',
};
