import { formatMoney, type AdminFlashSale, type AdminFlashSaleStatus } from '@store/shared';
import { useState, type FormEvent } from 'react';

import { ApiError } from '../../../api/client';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { inputToIso } from '../content/datetime';
import { adminErrorMessage } from '../errors';
import { inputToCents } from '../money-input';

import {
  emptyFlashForm,
  newItem,
  parseFlashForm,
  percentOff,
  saleToForm,
  serverFieldErrors,
  type FlashFormState,
} from './flash-form';
import {
  useAdminFlashSales,
  useDeleteFlashSale,
  useEndFlashSale,
  useSaveFlashSale,
  useShortenFlashSale,
  useVariantLookup,
} from './queries';

const STATUS: Record<AdminFlashSaleStatus, { label: string; tone: BadgeTone }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  active: { label: 'Live', tone: 'success' },
  ended: { label: 'Ended', tone: 'neutral' },
};

const money = (cents: number) => formatMoney(cents, 'EUR');
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

// One row of the form: SKU + sale price, and under them what the SKU resolves to and the % off.
// The lookup runs when the admin leaves the SKU box, not on every key.
function ItemRow({
  index,
  sku,
  price,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  sku: string;
  price: string;
  errors: Record<string, string>;
  canRemove: boolean;
  onChange: (patch: { sku?: string; price?: string }) => void;
  onRemove: () => void;
}) {
  const [looked, setLooked] = useState(sku.trim());
  const lookup = useVariantLookup(looked);
  const cents = inputToCents(price);
  const variant =
    lookup.data && looked.toLowerCase() === sku.trim().toLowerCase() ? lookup.data : null;
  let info: string | null = null;
  let bad = false;
  if (variant) {
    info = `${variant.productName} (${variant.variantName}). Regular price ${money(variant.regularCents)}.`;
    if (cents !== null && cents > 0) {
      if (cents < variant.regularCents) {
        info += ` ${percentOff(variant.regularCents, cents)}% off.`;
      } else {
        info += ' The sale price must be below the regular price.';
        bad = true;
      }
    }
  } else if (lookup.isError && looked !== '' && looked === sku.trim()) {
    info = 'No variant has that SKU.';
    bad = true;
  }
  const n = index + 1;
  return (
    <li
      data-testid="flash-item-row"
      className="flex flex-col gap-2 rounded-control border-2 border-line p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label={`SKU, item ${n}`}
          value={sku}
          onChange={(e) => onChange({ sku: e.target.value })}
          onBlur={() => setLooked(sku.trim())}
          error={errors[`items.${index}.variant`]}
          autoCapitalize="characters"
        />
        <Input
          label={`Sale price (EUR), item ${n}`}
          inputMode="decimal"
          value={price}
          onChange={(e) => onChange({ price: e.target.value })}
          error={errors[`items.${index}.salePriceCents`]}
        />
      </div>
      <p
        aria-live="polite"
        data-testid="flash-item-info"
        className={bad ? 'text-sm font-semibold text-danger' : 'text-sm text-muted'}
      >
        {info}
      </p>
      {canRemove && (
        <div>
          <Button variant="secondary" onClick={onRemove}>
            Remove <span className="sr-only">item {n}</span>
          </Button>
        </div>
      )}
    </li>
  );
}

function SaleForm({ sale, onDone }: { sale: AdminFlashSale | undefined; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveFlashSale();
  const [form, setForm] = useState<FlashFormState>(sale ? saleToForm(sale) : emptyFlashForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = parseFlashForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    save.mutate(
      { id: sale?.id, input: parsed.input },
      {
        onSuccess: () => {
          toast.show(sale ? 'Sale saved' : 'Sale created', 'success');
          onDone();
        },
        onError: (err) => {
          // Row problems the server found (a price at or above the regular one) go on their inputs.
          const fields =
            err instanceof ApiError && err.code === 'VALIDATION_ERROR'
              ? serverFieldErrors(err.details)
              : {};
          if (Object.keys(fields).length > 0) setErrors(fields);
          else setServerError(adminErrorMessage(err));
        },
      },
    );
  };

  const setItem = (key: string, patch: { sku?: string; price?: string }) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((i) =>
        i.key === key
          ? {
              ...i,
              ...(patch.sku !== undefined && { sku: patch.sku }),
              ...(patch.price !== undefined && { price: patch.price }),
            }
          : i,
      ),
    }));

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="admin-flash-form"
      className="flex flex-col gap-4"
    >
      <FormAlert message={serverError} />
      <Input
        label="Sale name"
        hint="Shown in the banner, like “Weekend Woof”"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        error={errors.name}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Starts (UTC)"
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          error={errors.startsAt}
        />
        <Input
          label="Ends (UTC)"
          type="datetime-local"
          value={form.endsAt}
          onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          error={errors.endsAt}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="font-semibold">Items</legend>
        <ul className="flex flex-col gap-3">
          {form.items.map((item, i) => (
            <ItemRow
              key={item.key}
              index={i}
              sku={item.sku}
              price={item.price}
              errors={errors}
              canRemove={form.items.length > 1}
              onChange={(patch) => setItem(item.key, patch)}
              onRemove={() =>
                setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== item.key) }))
              }
            />
          ))}
        </ul>
        {errors.items && (
          <p role="alert" className="text-sm text-danger">
            {errors.items}
          </p>
        )}
        <div>
          <Button
            variant="secondary"
            onClick={() => setForm((f) => ({ ...f, items: [...f.items, newItem()] }))}
          >
            Add item
          </Button>
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {sale ? 'Save sale' : 'Create sale'}
        </Button>
      </div>
    </form>
  );
}

// An active or ended sale: read-only, with the Omnibus reference per item. A running sale can be
// ended earlier or right now; nothing else about it may change.
function SaleDetail({ sale, onDone }: { sale: AdminFlashSale; onDone: () => void }) {
  const toast = useToast();
  const shorten = useShortenFlashSale();
  const end = useEndFlashSale();
  const [endsAt, setEndsAt] = useState(sale.endsAt.slice(0, 16));
  const [error, setError] = useState<string | null>(null);
  const running = sale.status === 'active';

  const done = (message: string) => ({
    onSuccess: () => {
      toast.show(message, 'success');
      onDone();
    },
    onError: (err: unknown) => setError(adminErrorMessage(err)),
  });

  return (
    <div data-testid="admin-flash-detail" className="flex flex-col gap-4">
      <FormAlert message={error} />
      <p className="text-muted">
        {utc(sale.startsAt)} to {utc(sale.endsAt)} UTC.{' '}
        {running
          ? 'This sale is live: its items and prices are locked. You can end it earlier or end it now.'
          : 'This sale has ended and stays as history.'}
      </p>
      <div className="relative overflow-x-auto rounded-card border border-line">
        <table className="w-full text-left">
          <caption className="sr-only">Items in {sale.name}</caption>
          <thead className="bg-bg text-sm">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Regular</th>
              <th className="p-3">Sale</th>
              <th className="p-3">Omnibus reference</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i) => (
              <tr
                key={i.id}
                className="border-t border-line align-top"
                data-testid="flash-detail-item"
              >
                <td className="min-w-40 p-3">
                  <span className="font-semibold">{i.sku}</span>
                  <span className="block text-sm text-muted">
                    {i.productName} ({i.variantName})
                  </span>
                </td>
                <td className="whitespace-nowrap p-3">{money(i.regularCents)}</td>
                <td className="whitespace-nowrap p-3">
                  {money(i.salePriceCents)}
                  <span className="block text-sm text-muted">
                    {percentOff(i.regularCents, i.salePriceCents)}% off
                  </span>
                </td>
                <td className="min-w-40 p-3 text-sm" data-testid="flash-omnibus">
                  {i.referenceCents !== null
                    ? `Lowest 30-day price: ${money(i.referenceCents)}`
                    : 'No history'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {running && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Input
            label="New end (UTC)"
            hint="Earlier than the current end"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              loading={shorten.isPending}
              onClick={() => {
                setError(null);
                const iso = inputToIso(endsAt);
                if (!iso) return setError('Pick the new end');
                shorten.mutate({ id: sale.id, endsAt: iso }, done('End moved earlier'));
              }}
            >
              Move the end
            </Button>
            <Button
              loading={end.isPending}
              onClick={() => {
                setError(null);
                if (
                  !window.confirm(`End ${sale.name} now? Prices go back to regular straight away.`)
                )
                  return;
                end.mutate(sale.id, done('Sale ended'));
              }}
            >
              End now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlashSalesAdmin() {
  const { data: sales, isPending, isError, refetch } = useAdminFlashSales();
  const remove = useDeleteFlashSale();
  const toast = useToast();
  const [open, setOpen] = useState<AdminFlashSale | 'new' | null>(null);

  const title =
    open === 'new' || open === null
      ? 'New flash sale'
      : open.status === 'scheduled'
        ? `Edit ${open.name}`
        : open.name;

  return (
    <section
      aria-labelledby="flash-heading"
      data-testid="admin-flash-sales"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="flash-heading" className="font-display text-lg font-bold">
          Flash sales
        </h3>
        <Button onClick={() => setOpen('new')}>New flash sale</Button>
      </div>
      <p className="text-muted">
        A scheduled sale can be edited or deleted. Once it is live only its end can move earlier.
        Ended sales stay as history.
      </p>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the sales.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : sales.length === 0 ? (
        <p className="text-muted">No flash sales yet. Create the first one.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-line">
          <table className="w-full text-left">
            <thead className="bg-bg text-sm">
              <tr>
                <th className="p-3">Sale</th>
                <th className="p-3">Window (UTC)</th>
                <th className="p-3">Items</th>
                <th className="p-3">Status</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-line align-top"
                  data-testid="admin-flash-row"
                >
                  <td className="min-w-32 p-3 font-semibold">{s.name}</td>
                  <td className="min-w-40 p-3 text-muted">
                    {utc(s.startsAt)}
                    <br />
                    {utc(s.endsAt)}
                  </td>
                  <td className="p-3">{s.itemCount}</td>
                  <td className="p-3">
                    <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => setOpen(s)}>
                        {s.status === 'scheduled' ? 'Edit' : 'View'}{' '}
                        <span className="sr-only">{s.name}</span>
                      </Button>
                      {s.status === 'scheduled' && (
                        <Button
                          variant="secondary"
                          loading={remove.isPending && remove.variables === s.id}
                          onClick={() => {
                            if (!window.confirm(`Delete ${s.name}?`)) return;
                            remove.mutate(s.id, {
                              onSuccess: () => toast.show('Sale deleted', 'success'),
                              onError: (err) => toast.show(adminErrorMessage(err), 'error'),
                            });
                          }}
                        >
                          Delete <span className="sr-only">{s.name}</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={title}
        className="max-w-2xl"
      >
        {open !== null &&
          (open === 'new' || open.status === 'scheduled' ? (
            <SaleForm sale={open === 'new' ? undefined : open} onDone={() => setOpen(null)} />
          ) : (
            <SaleDetail sale={open} onDone={() => setOpen(null)} />
          ))}
      </Dialog>
    </section>
  );
}
