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
  // ---------- the order: changes ----------
  'subs.order.heading': 'Changes to your order',
  'subs.order.intro': 'Something was not on the shelf. Here is what we did and what you pay.',
  'subs.order.missing': 'Not in stock.',
  'subs.order.short': 'We found {picked} of {quantity}. You pay for {picked}.',
  'subs.order.notCharged': 'You are not charged for what is missing.',
  'subs.order.instead': 'Replacement',
  'subs.order.priceEach': '{quantity} x {price} each',
  'subs.order.save': 'You save {amount}',
  'subs.order.accept': 'Accept',
  'subs.order.reject': 'Reject',
  'subs.order.unanswered': 'If you do not answer, we keep it when we dispatch your order.',
  'subs.order.accepted': 'Accepted.',
  'subs.order.atDoor': 'If you do not want it at the door, tell the courier and we refund it.',
  'subs.order.rejected': 'Rejected. You are not charged for it.',
  'subs.order.refused': 'Refused at the door. We refunded {amount}.',
  'subs.order.answerClosed':
    'The bag has left. Tell the courier at the door if you do not want it.',
  'subs.order.answerError': 'We could not save your answer. Try again.',
  'subs.order.replaces': 'Replaces {name}',
  'subs.order.foundOf': '{picked} of {quantity}',
  'subs.order.notChargedShort': 'Not charged',
  'subs.order.changedOnTracking':
    'Something changed in this order. Answer from the link in our email, or sign in to your account.',
  // ---------- the link in the email ----------
  'subs.link.title': 'Your replacement',
  'subs.link.intro.accept':
    'You are about to keep the replacement. We charge it at the price we showed you, never above the original.',
  'subs.link.intro.reject':
    'You are about to turn down the replacement. We take it out and do not charge you for it.',
  'subs.link.confirm.accept': 'Accept the replacement',
  'subs.link.confirm.reject': 'Reject the replacement',
  'subs.link.done.accept': 'Done. We keep the replacement.',
  'subs.link.done.reject': 'Done. We take the replacement out and do not charge you for it.',
  'subs.link.error.gone': 'This link does not work any more.',
  'subs.link.error.closed':
    'The bag has left, so this can no longer be changed here. Tell the courier at the door.',
  'subs.link.error.generic': 'We could not save your answer. Try again.',
  'subs.link.shop': 'Back to the shop',
  'subs.track.replacement': 'Replacement: {quantity} x {name} ({status}).',
  'subs.track.status.proposed': 'waiting for your answer',
  'subs.track.status.accepted': 'accepted',
  'subs.track.status.rejected': 'rejected',
} as const;
