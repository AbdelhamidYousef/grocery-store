import type { WebCart } from '../../api/cart';
import type { StringKey, TFunction } from '../../i18n';

// Every sentence the cart says about promotions lives here, so the wording is reviewed in one
// place. The engine sends machine keys; a key this build does not know yields null (the web may
// be deployed before the API stops sending it), and the notice is simply not shown.
type Pricing = WebCart['pricing'];
type PricingNotice = Pricing['notices'][number];

export function noticeSentence(
  notice: PricingNotice,
  pricing: Pricing,
  money: (cents: number) => string,
  t: TFunction,
): string | null {
  const code = pricing.code ?? t('cart.code.fallbackName');
  switch (notice.key) {
    case 'code_unknown':
      return t('cart.promo.unknown', { code });
    case 'code_used_up':
      return t('cart.promo.usedUp', { code });
    case 'code_already_used':
      return t('cart.promo.alreadyUsed', { code });
    case 'code_not_started':
      return t('cart.promo.notStarted', { code });
    case 'code_expired':
      return t('cart.promo.expired', { code });
    case 'code_min_spend':
      return t('cart.promo.minSpend', { amount: money(notice.cents ?? 0), code });
    case 'code_no_eligible_items':
      return t('cart.promo.noEligibleItems', { code });
    case 'code_first_order_only':
      return t('cart.promo.firstOrderOnly', { code });
    case 'code_not_stackable': {
      // The tier's own label ("10% bulk discount") is what the engine applied instead.
      const tier = pricing.adjustments.find((a) => a.type === 'bulk_tier');
      return t('cart.promo.notStackable', {
        tier: tier?.label ?? t('cart.promo.bulkFallback'),
        code,
      });
    }
    case 'credit_capped':
      return t('cart.promo.creditCapped');
    default:
      return null;
  }
}

// The fixed stacking order of the pricing engine (plan 18, "engine contract"), as dictionary keys.
export const DISCOUNT_RULES: readonly StringKey[] = [
  'cart.rules.bestPrice',
  'cart.rules.orderDiscount',
  'cart.rules.gift',
  'cart.rules.delivery',
  'cart.rules.credits',
];
