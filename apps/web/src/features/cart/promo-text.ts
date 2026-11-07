import { formatMoney } from '@store/shared';

import type { WebCart } from '../../api/cart';

// Every sentence the cart says about promotions lives here, so the wording is reviewed in one
// place. The engine sends machine keys; a key this build does not know yields null (the web may
// be deployed before the API stops sending it), and the notice is simply not shown.
type Pricing = WebCart['pricing'];
type PricingNotice = Pricing['notices'][number];

export function noticeSentence(
  notice: PricingNotice,
  pricing: Pricing,
  currency: string,
): string | null {
  const code = pricing.code ?? 'your code';
  switch (notice.key) {
    case 'code_unknown':
      return `We could not find the code ${code}.`;
    case 'code_used_up':
      return `${code} has been used up.`;
    case 'code_already_used':
      return `You have already used ${code}.`;
    case 'code_not_started':
      return `${code} is not active yet.`;
    case 'code_expired':
      return `${code} has expired.`;
    case 'code_min_spend':
      return `Add ${formatMoney(notice.cents ?? 0, currency)} more to use ${code}.`;
    case 'code_no_eligible_items':
      return `${code} does not apply to anything in your cart right now.`;
    case 'code_first_order_only':
      return `${code} is for first orders only.`;
    case 'code_not_stackable': {
      // The tier's own label ("10% bulk discount") is what the engine applied instead.
      const tier = pricing.adjustments.find((a) => a.type === 'bulk_tier');
      return `Your ${tier?.label ?? 'bulk discount'} saves more than ${code}, so we used that.`;
    }
    case 'credit_capped':
      return 'Your credit was capped so the total never goes below zero.';
    default:
      return null;
  }
}

// The fixed stacking order of the pricing engine (plan 18, "engine contract"), in words.
export const DISCOUNT_RULES: readonly string[] = [
  'Each item uses its best single price: regular, sale or member price. Prices never stack with each other.',
  'Then one order discount: a bulk discount or a code, whichever saves you more. Never both. Codes can exclude items already on sale.',
  'A free gift is added once your items, after that discount, reach the gift threshold.',
  'Delivery is free over the delivery threshold or with a free-delivery code. Free-delivery codes work together with everything else.',
  'Credits come last. They never pay for delivery, and your total never goes below zero.',
];
