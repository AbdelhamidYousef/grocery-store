import { formatMoney, type AdminProduct, type AdminVariant } from '@store/shared';
import { useMemo, useState } from 'react';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { formatOptions } from './product-form';
import { useDeleteAdminVariant } from './queries';
import { StockDialog } from './StockDialog';
import { VariantDialog } from './VariantDialog';

// How many variants before a filter box appears: a handful needs no search, 100 does.
const FILTER_FROM = 12;

function DeleteVariantDialog({
  variant,
  onClose,
}: {
  variant: AdminVariant | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const mutation = useDeleteAdminVariant();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={variant !== null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Delete this variant?"
    >
      {variant && (
        <div className="flex flex-col gap-4">
          <FormAlert message={error} />
          <p className="break-words">
            {variant.sku} will be removed from the shop and from carts. Past orders keep their own
            copy. A variant that unpaid orders have reserved cannot be deleted: archive it instead.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate(variant.id, {
                  onSuccess: () => {
                    toast.show(`Deleted ${variant.sku}`, 'success');
                    onClose();
                  },
                  onError: (e) => setError(adminErrorMessage(e)),
                })
              }
            >
              Delete variant
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// The saved variants of a product, one table row each with its own Edit / Adjust stock / Delete.
// Each action is a small dialog instead of an inline editable row: a product can hold well over a
// hundred variants, and a hundred live forms on one page would be slow and unusable on a phone.
// The table scrolls inside its own box (both ways), so it can never widen the page.
export function VariantsSection({ product }: { product: AdminProduct }) {
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminVariant | null>(null);
  const [stocking, setStocking] = useState<AdminVariant | null>(null);
  const [deleting, setDeleting] = useState<AdminVariant | null>(null);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    // Variants created together share one timestamp, so the API's order among them is arbitrary:
    // show the default first, then by SKU with numbers in numeric order (SKU-2 before SKU-10).
    const ordered = [...product.variants].sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.sku.localeCompare(b.sku, undefined, { numeric: true }),
    );
    if (!needle) return ordered;
    return ordered.filter((v) =>
      `${v.sku} ${v.name} ${formatOptions(v.options)}`.toLowerCase().includes(needle),
    );
  }, [filter, product.variants]);

  return (
    <section aria-labelledby="variants-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="variants-heading" className="font-display text-lg font-bold">
          Variants ({product.variants.length})
        </h3>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add variant
        </Button>
      </div>

      {product.variants.length > FILTER_FROM && (
        <Input
          label="Filter variants"
          hint="SKU, name or options"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      {shown.length === 0 ? (
        <p className="text-muted" data-testid={TEST_IDS.adminEmpty}>
          {product.variants.length === 0
            ? 'This product has no variants, so it cannot be bought.'
            : 'No variant matches that filter.'}
        </p>
      ) : (
        <div
          className="max-h-[32rem] overflow-auto rounded-card border-2 border-line bg-surface"
          data-testid={TEST_IDS.adminTable}
        >
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <caption className="sr-only">Variants of {product.name}</caption>
            <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Variant
                </th>
                <th scope="col" className="px-3 py-2">
                  Price
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Weight
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Stock
                </th>
                <th scope="col" className="px-3 py-2">
                  Status
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-line align-middle"
                  data-testid={TEST_IDS.adminVariantRow}
                >
                  <th scope="row" className="max-w-[16rem] px-3 py-2 text-left font-normal">
                    <span className="block break-words font-semibold">{v.sku}</span>
                    <span className="block break-words text-muted">
                      {v.name}
                      {Object.keys(v.options).length > 0 && ` (${formatOptions(v.options)})`}
                    </span>
                    {v.isDefault && (
                      <Badge tone="pet" className="mt-1">
                        Opens first
                      </Badge>
                    )}
                  </th>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatMoney(v.priceCents, v.currency)}
                    {v.compareAtPriceCents !== null && (
                      <s className="ml-2 text-muted">
                        {formatMoney(v.compareAtPriceCents, v.currency)}
                      </s>
                    )}
                    {v.memberPriceCents !== null && (
                      <span className="block text-xs text-muted">
                        Member {formatMoney(v.memberPriceCents, v.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{v.weightGrams} g</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="font-semibold">{v.available}</span> available
                    <span className="block text-xs text-muted">
                      {v.quantity} on hand, {v.reserved} reserved
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={v.status === 'active' ? 'success' : 'neutral'}>{v.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${v.sku}`}
                        onClick={() => setEditing(v)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Adjust stock for ${v.sku}`}
                        onClick={() => setStocking(v)}
                      >
                        Stock
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${v.sku}`}
                        onClick={() => setDeleting(v)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VariantDialog productId={product.id} open={adding} onClose={() => setAdding(false)} />
      <VariantDialog
        productId={product.id}
        variant={editing ?? undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
      <StockDialog variant={stocking} onClose={() => setStocking(null)} />
      <DeleteVariantDialog variant={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
