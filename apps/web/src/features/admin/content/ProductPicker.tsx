import { useState } from 'react';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAdminProducts } from '../queries';

export interface PickedProduct {
  id: string;
  name: string;
}

// Search products by name, SKU or slug and add them to a list of chips. Used by guides ("products
// mentioned"). The admin product search is the same one the products screen uses.
export function ProductPicker({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
}) {
  const [q, setQ] = useState('');
  const { data } = useAdminProducts({ q: q.trim(), page: 1, limit: 6 });
  const chosen = new Set(selected.map((p) => p.id));
  const results = q.trim() ? (data?.data ?? []).filter((p) => !chosen.has(p.id)) : [];

  return (
    <fieldset className="flex flex-col gap-3" data-testid="product-picker">
      <legend className="text-sm font-semibold">{label}</legend>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1 rounded-full border-2 border-line bg-surface py-0.5 pl-3 pr-1"
            >
              <span className="break-words">{p.name}</span>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => onChange(selected.filter((x) => x.id !== p.id))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-bold hover:bg-pet-soft"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No products linked yet.</p>
      )}
      <Input
        label="Find a product to add"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        hint="Name, slug or SKU"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line">
          {results.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 break-words">{p.name}</span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Add ${p.name}`}
                onClick={() => onChange([...selected, { id: p.id, name: p.name }])}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
