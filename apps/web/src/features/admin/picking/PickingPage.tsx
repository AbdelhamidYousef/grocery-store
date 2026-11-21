import { type PickingOrder, type PickListEntry, type PickZone } from '@store/shared';
import { useEffect, useState } from 'react';

import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { cn } from '../../../lib/cn';
import { TEST_IDS } from '../../../lib/test-ids';

import { BagPanel } from './BagPanel';
import { LineActions } from './LineActions';
import { usePickStores, usePicking } from './queries';

const ZONE_LABEL: Record<PickZone, string> = {
  ambient: 'Ambient',
  chilled: 'Chilled',
  frozen: 'Frozen',
};
const ZONE_HINT: Record<PickZone, string> = {
  ambient: 'Shelves first',
  chilled: 'Then the fridges',
  frozen: 'Freezers last, straight into the bag',
};

const STORE_KEY = 'grocery.picking.store';
const readStore = (): string | undefined => {
  try {
    return localStorage.getItem(STORE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

// The packer view: a store, the orders due soon as numbered bags, and one pick list for all of them
// in walking order. Everything is a column that wraps: one column on a tablet, two on a wide screen.
export function PickingPage() {
  const stores = usePickStores();
  const [chosen, setChosen] = useState<string | undefined>(readStore);
  const [window, setWindow] = useState<'next' | 'all'>('next');
  const slug =
    chosen && stores.data?.some((s) => s.slug === chosen) ? chosen : stores.data?.[0]?.slug;
  useEffect(() => {
    if (!slug) return;
    try {
      localStorage.setItem(STORE_KEY, slug);
    } catch {
      /* a private window: the choice just is not remembered */
    }
  }, [slug]);
  const picking = usePicking(slug, window);
  const data = picking.data;
  const openUnits = data?.pickList.reduce((n, e) => n + e.remainingQty, 0) ?? 0;

  return (
    <section data-testid={TEST_IDS.pickingPage} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Picking</h2>
          <p className="text-sm text-muted" aria-live="polite">
            {data
              ? `${data.orders.length} ${data.orders.length === 1 ? 'bag' : 'bags'}, ${openUnits} ${openUnits === 1 ? 'unit' : 'units'} left to pick`
              : 'Loading the orders'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Store"
            value={slug ?? ''}
            onChange={(e) => setChosen(e.target.value)}
            className="min-w-48"
          >
            {stores.data?.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            label="Orders"
            value={window}
            onChange={(e) => setWindow(e.target.value === 'all' ? 'all' : 'next')}
          >
            <option value="next">Due in the next 2 hours</option>
            <option value="all">All still to pack</option>
          </Select>
        </div>
      </div>

      {picking.isPending && slug && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {picking.isError && (
        <p role="alert" className="font-semibold text-danger">
          The orders could not be loaded. Try again in a moment.
        </p>
      )}
      {data && data.orders.length === 0 && (
        <p className="rounded-card border-2 border-line p-6 text-center text-muted">
          Nothing to pack right now. New paid orders appear here by themselves.
        </p>
      )}
      {data && data.totalOrders > data.orders.length && (
        <p className="rounded-control bg-primary-soft p-3 text-sm font-semibold">
          Showing the first {data.orders.length} of {data.totalOrders} orders, oldest window first.
          Pack these and the rest appear.
        </p>
      )}
      {data && data.orders.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <WalkList entries={data.pickList} orders={data.orders} />
          <div className="flex min-w-0 flex-col gap-4">
            <h3 className="font-display text-xl font-bold">Bags</h3>
            {data.orders.map((order) => (
              <BagPanel key={order.number} order={order} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WalkList({ entries, orders }: { entries: PickListEntry[]; orders: PickingOrder[] }) {
  const lockedOf = new Map(orders.map((o) => [o.number, o.packedAt !== null]));
  const lineOf = new Map(orders.flatMap((o) => o.lines.map((l) => [l.itemId, l] as const)));
  const zones = (['ambient', 'chilled', 'frozen'] as const).filter((z) =>
    entries.some((e) => e.zone === z),
  );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h3 className="font-display text-xl font-bold">Pick list</h3>
      {zones.map((zone) => (
        <div key={zone} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h4 className="font-display text-lg font-bold">{ZONE_LABEL[zone]}</h4>
            <span className="text-sm text-muted">{ZONE_HINT[zone]}</span>
          </div>
          <ol className="flex flex-col gap-3">
            {entries
              .filter((e) => e.zone === zone)
              .map((e) => (
                <li
                  key={e.key}
                  data-testid={TEST_IDS.pickingEntry}
                  className={cn(
                    'rounded-card border-2 border-line p-3',
                    e.remainingQty === 0 && 'bg-primary-soft',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex min-h-9 min-w-16 shrink-0 items-center justify-center rounded-control bg-ink px-2 font-display text-sm font-bold text-surface">
                      {e.aisle === null ? 'No aisle' : `Aisle ${e.aisle}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{e.productName}</p>
                      <p className="break-words text-sm text-muted">
                        {e.variantName} · {e.sku}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-xl font-bold">
                      {e.weighed ? `${e.totalQty} to weigh` : `× ${e.totalQty}`}
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
                    {e.stops.map((stop) => {
                      const line = lineOf.get(stop.itemId);
                      return (
                        <li key={stop.itemId} className="flex flex-col gap-1">
                          <p className="text-sm">
                            <strong>Bag {stop.bag}</strong> × {stop.quantity}
                            {stop.batches.length > 0 && (
                              <span className="text-muted">
                                {' '}
                                · take{' '}
                                {stop.batches
                                  .map((b) => `${b.quantity} best before ${b.bestBefore ?? 'none'}`)
                                  .join(', ')}
                              </span>
                            )}
                          </p>
                          {line && (
                            <LineActions
                              line={line}
                              locked={lockedOf.get(stop.orderNumber) === true}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
