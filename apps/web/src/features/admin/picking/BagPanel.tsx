import type { PickingOrder } from '@store/shared';

import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { cn } from '../../../lib/cn';
import { TEST_IDS } from '../../../lib/test-ids';
import { adminErrorMessage } from '../errors';

import { LineActions } from './LineActions';
import { useDispatchOrder, usePackOrder } from './queries';
import { windowLabel } from './window-label';

// One bag: the order, its window and every line with what is left to do.
export function BagPanel({ order }: { order: PickingOrder }) {
  const locked = order.packedAt !== null;
  const toast = useToast();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const fail = (e: unknown) => toast.show(adminErrorMessage(e), 'error');
  return (
    <article
      data-testid={TEST_IDS.pickingBag}
      aria-label={`Bag ${order.bag}, order ${order.number}`}
      className="min-w-0 rounded-card border-2 border-line p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-lg font-bold">
          Bag {order.bag}{' '}
          <span className="break-all text-base font-semibold text-muted">{order.number}</span>
        </h4>
        <p className="font-semibold">{windowLabel(order)}</p>
      </header>
      <p className="mt-1 text-sm text-muted">
        {order.firstName ? `For ${order.firstName}. ` : ''}
        {order.openLines === 0
          ? 'Every line is done.'
          : `${order.openLines} ${order.openLines === 1 ? 'line' : 'lines'} left.`}
        {order.openSwaps > 0 &&
          ` ${order.openSwaps} ${order.openSwaps === 1 ? 'replacement is' : 'replacements are'} waiting for the shopper.`}
        {locked && ' Packed.'}
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {order.lines.map((line) => (
          <li
            key={line.itemId}
            data-testid={TEST_IDS.pickingLine}
            className={cn('flex flex-col gap-2 py-3 first:pt-0', line.resolved && 'opacity-80')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {line.productName}
                  {line.replaces && (
                    <span className="font-normal text-muted"> replaces {line.replaces}</span>
                  )}
                </p>
                <p className="break-words text-sm text-muted">
                  {line.variantName}
                  {line.swapStatus === 'proposed' && ' · waiting for the shopper'}
                  {line.swapStatus === 'accepted' && ' · accepted'}
                </p>
              </div>
              <span className="shrink-0 font-display font-bold">× {line.quantity}</span>
            </div>
            <LineActions line={line} locked={locked} />
          </li>
        ))}
      </ul>
      <footer className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
        {!locked ? (
          <>
            <Button
              disabled={order.openLines > 0}
              loading={pack.isPending}
              onClick={() => pack.mutate(order.number, { onError: fail })}
            >
              Bag packed
            </Button>
            {order.openLines > 0 && (
              <p className="text-sm text-muted">Finish every line to close the bag.</p>
            )}
          </>
        ) : (
          <>
            <Button
              loading={dispatch.isPending}
              onClick={() =>
                dispatch.mutate(order.number, {
                  onSuccess: () => toast.show(`${order.number} is on the way`, 'success'),
                  onError: fail,
                })
              }
            >
              Hand to rider
            </Button>
            <p className="text-sm text-muted">
              The card is charged for what is in the bag.
              {order.openSwaps > 0 &&
                ' A replacement the shopper has not answered counts as accepted.'}
            </p>
          </>
        )}
      </footer>
    </article>
  );
}
