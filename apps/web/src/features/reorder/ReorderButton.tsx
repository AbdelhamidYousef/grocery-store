import type { ReorderResult } from '@store/shared';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { useT, type StringKey } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';

import { useReorder } from './queries';

const REASON: Record<ReorderResult['skipped'][number]['reason'], StringKey> = {
  sold_out: 'account.reorder.reason.sold_out',
  unavailable: 'account.reorder.reason.unavailable',
  limit: 'account.reorder.reason.limit',
};

// "Buy these again" on an order: every line that can go in the cart does, and the ones that cannot
// are listed with the reason, so nothing disappears quietly.
export function ReorderButton({
  orderNumber,
  label,
}: {
  orderNumber: string;
  /** The button text; defaults to "Buy these again" (an order page). */
  label?: string;
}) {
  const reorder = useReorder();
  const { t, tn } = useT();
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
        {label ?? t('account.reorder.button')}
      </Button>
      {reorder.isError && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {t('account.reorder.error')}
        </p>
      )}
      {result && (
        <div role="status" className="mt-2 text-sm">
          <p className="font-semibold">
            {result.added.length > 0
              ? tn('account.reorder.added', result.added.length)
              : t('account.reorder.nothing')}{' '}
            <Link to="/cart" className="text-primary-strong underline">
              {t('account.reorder.viewCart')}
            </Link>
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted" data-testid={TEST_IDS.reorderSkipped}>
              {result.skipped.map((s) => (
                <li key={`${s.name}-${s.variantName}`}>
                  {t('account.reorder.skipped', {
                    name: s.name,
                    variant: s.variantName,
                    reason: t(REASON[s.reason]),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
