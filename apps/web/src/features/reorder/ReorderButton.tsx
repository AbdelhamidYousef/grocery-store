import type { ReorderResult } from '@store/shared';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';

import { useReorder } from './queries';

const REASON: Record<ReorderResult['skipped'][number]['reason'], string> = {
  sold_out: 'sold out right now',
  unavailable: 'no longer sold',
  limit: 'limited to one per customer',
};

// "Buy these again" on an order: every line that can go in the cart does, and the ones that cannot
// are listed with the reason, so nothing disappears quietly.
export function ReorderButton({ orderNumber }: { orderNumber: string }) {
  const reorder = useReorder();
  const result = reorder.data;
  return (
    <div className="mt-3" data-testid={TEST_IDS.reorder}>
      <Button
        variant="secondary"
        loading={reorder.isPending}
        onClick={() =>
          reorder.mutate(orderNumber, {
            onSuccess: (r) =>
              track({ name: 'reorder', added: r.added.length, skipped: r.skipped.length }),
          })
        }
      >
        Buy these again
      </Button>
      {reorder.isError && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          We could not add these to your cart. Please try again.
        </p>
      )}
      {result && (
        <div role="status" className="mt-2 text-sm">
          <p className="font-semibold">
            {result.added.length > 0
              ? `Added ${result.added.length} ${result.added.length === 1 ? 'item' : 'items'} to your cart. `
              : 'Nothing could be added. '}
            <Link to="/cart" className="text-primary-strong underline">
              View cart
            </Link>
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted" data-testid={TEST_IDS.reorderSkipped}>
              {result.skipped.map((s) => (
                <li key={`${s.name}-${s.variantName}`}>
                  {s.name} ({s.variantName}): {REASON[s.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
