import type { Variant } from '@store/shared';
import { useId, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { TEST_IDS } from '../../lib/test-ids';

import { QuantityStepper } from './QuantityStepper';

// The API only says "available" (never the stock number: that is business data), so the stepper
// cannot know the true limit. 10 is a sane per-line cap for a pet shop; the cart (phase 7) is
// where the server enforces the real stock and answers OUT_OF_STOCK.
export const MAX_QUANTITY = 10;

interface AddToCartProps {
  variant: Variant;
  /** Without it the button is disabled with an explanation (how the catalog tests render it). */
  onAdd?: (quantity: number) => void;
  /** True while the request is in flight: the button shows a spinner and cannot be pressed twice. */
  pending?: boolean;
}

export function AddToCart({ variant, onAdd, pending = false }: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);
  const noteId = useId();
  const soldOut = !variant.available;
  const wired = onAdd !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {variant.available && variant.lowStock && (
        <p
          data-testid={TEST_IDS.stockHint}
          className="inline-flex w-fit items-center rounded-full bg-danger-soft px-3 py-1 text-sm font-bold text-danger"
        >
          Only a few left
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={MAX_QUANTITY}
          disabled={soldOut}
        />
        <Button
          size="lg"
          data-testid={TEST_IDS.addToCart}
          loading={pending}
          disabled={soldOut || !wired}
          aria-describedby={!soldOut && !wired ? noteId : undefined}
          onClick={() => onAdd?.(quantity)}
          className="min-w-48 flex-1 sm:flex-none"
        >
          {soldOut ? 'Sold out' : 'Add to cart'}
        </Button>
      </div>
      {!soldOut && !wired && (
        <p id={noteId} className="text-sm text-muted">
          Adding to the cart is not available here.
        </p>
      )}
    </div>
  );
}
