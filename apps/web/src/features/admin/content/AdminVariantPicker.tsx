import { useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAdminProduct, useAdminProducts } from '../queries';

export interface PickedVariant {
  id: string;
  label: string;
}

// Pick the variants a safety notice covers: search a product, then add any of its variants. A
// recall is often one size or one batch, which is why the unit is the variant.
export function AdminVariantPicker({
  selected,
  onChange,
}: {
  selected: PickedVariant[];
  onChange: (next: PickedVariant[]) => void;
}) {
  const [q, setQ] = useState('');
  const [productId, setProductId] = useState<string | undefined>();
  const { data: found } = useAdminProducts({ q: q.trim(), page: 1, limit: 6 });
  const { data: product } = useAdminProduct(productId);
  const chosen = new Set(selected.map((v) => v.id));

  return (
    <fieldset className="flex flex-col gap-3" data-testid="variant-picker">
      <legend className="text-sm font-semibold">Affected variants</legend>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-1 rounded-full border-2 border-line bg-surface py-0.5 pl-3 pr-1"
            >
              <span className="break-words">{v.label}</span>
              <button
                type="button"
                aria-label={`Remove ${v.label}`}
                onClick={() => onChange(selected.filter((x) => x.id !== v.id))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-bold hover:bg-dept-soft"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No variants yet. A notice with none is shown on the homepage only.
        </p>
      )}
      <Input
        label="Find a product"
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setProductId(undefined);
        }}
        hint="Name, slug or SKU"
      />
      {q.trim() && !productId && (found?.data.length ?? 0) > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line">
          {found?.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 break-words">{p.name}</span>
              <Button size="sm" variant="secondary" onClick={() => setProductId(p.id)}>
                Show variants
              </Button>
            </li>
          ))}
        </ul>
      )}
      {product && (
        <div>
          <p className="text-sm font-semibold">Variants of {product.name}</p>
          <ul className="mt-1 divide-y divide-line rounded-card border border-line">
            {product.variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0 break-words">
                  {v.name} <span className="text-muted">({v.sku})</span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={chosen.has(v.id)}
                  aria-label={`Add ${product.name} ${v.name}`}
                  onClick={() =>
                    onChange([...selected, { id: v.id, label: `${product.name}: ${v.name}` }])
                  }
                >
                  {chosen.has(v.id) ? 'Added' : 'Add'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}
