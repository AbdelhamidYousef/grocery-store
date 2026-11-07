import { TEST_IDS } from '../../lib/test-ids';

import { DISCOUNT_RULES } from './promo-text';

// Native <details>: keyboard and screen-reader support for free, and no JS state to keep.
export function DiscountsCombine() {
  return (
    <details data-testid={TEST_IDS.cartDiscountsCombine} className="text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold underline">
        How discounts combine
      </summary>
      <ol className="ml-5 list-decimal space-y-1.5 pb-2">
        {DISCOUNT_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
    </details>
  );
}
