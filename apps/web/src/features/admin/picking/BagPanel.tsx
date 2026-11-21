import type { PickingOrder } from '@store/shared';

import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { cn } from '../../../lib/cn';
import { TEST_IDS } from '../../../lib/test-ids';
import { adminErrorMessage } from '../errors';

import { LineActions } from './LineActions';
import { useDispatchOrder, usePackOrder } from './queries';
import { windowLabel } from './window-label';

export const bagStatus = (order: PickingOrder) =>
  order.packedAt !== null
    ? 'Ready to hand over'
    : order.openLines === 0
      ? 'Ready to pack'
      : 'To pick';

// One bag: a summary row (order, window, items, status) that opens to every line with what is left
// to do. The page keeps one bag open at a time.
export function BagPanel({
  order,
  open,
  onToggle,
}: {
  order: PickingOrder;
  open: boolean;
  onToggle: () => void;
}) {
  const locked = order.packedAt !== null;
  const toast = useToast();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const fail = (e: unknown) => toast.show(adminErrorMessage(e), 'error');
  return (
    <article
      id={`bag-${order.number}`}
      data-testid={TEST_IDS.pickingBag}
      aria-label={`Bag ${order.bag}, order ${order.number}`}
      className="min-w-0 scroll-mt-4 rounded-card border-2 border-line"
    >
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`bag-panel-${order.number}`}
          onClick={onToggle}
          className="flex min-h-12 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 text-left"
        >
          <span className="font-display text-lg font-bold">
            Bag {order.bag}{' '}
            <span className="break-all text-base font-semibold text-muted">{order.number}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-sm">
            <span className="font-semibold">{windowLabel(order)}</span>
            <span className="text-muted">
              {order.lines.length} {order.lines.length === 1 ? 'item' : 'items'}
            </span>
            <span className="rounded-control bg-primary-soft px-2 py-0.5 font-semibold">
              {bagStatus(order)}
            </span>
            <span aria-hidden="true">{open ? '−' : '+'}</span>
          </span>
        </button>
      </h4>
      <div
        id={`bag-panel-${order.number}`}
        role="region"
        aria-label={`Bag ${order.bag} lines`}
        hidden={!open}
        className="border-t-2 border-line p-4"
      >
        <p className="text-sm text-muted">
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
      </div>
    </article>
  );
}
