// Substitutions (phase G7): what we do when something is missing at packing time.
export const substitutions = {
  'subs.label': 'If it is missing',
  'subs.option.best_match': 'Best match',
  'subs.option.specific': 'Choose a product',
  'subs.option.none': 'Refund it',
  'subs.hint.best_match':
    'We pick a safe match of about the same price. You never pay more than for the original.',
  'subs.hint.none': 'We leave it out and do not charge you for it.',
  'subs.chosen': 'Instead: {name}.',
  'subs.change': 'Change',
  'subs.all.label': 'Same for every item:',
  'subs.toast.all': 'Saved for every item in your cart.',
  'subs.pick.title': 'Replace {name} with',
  'subs.pick.intro':
    'These are safe: no new allergens, the same diets, about the same price and in stock now.',
  'subs.pick.choose': 'Choose',
  'subs.pick.empty': 'Nothing safe is in stock right now. If it is missing, we refund it.',
  'subs.pick.error': 'We could not load the products. Try again.',
  // ---------- account ----------
  'subs.account.heading': 'If something is missing',
  'subs.account.intro': 'New items in your cart start with this choice. You can change each one.',
  'subs.account.save': 'Save',
  'subs.account.saved': 'Saved.',
} as const;
