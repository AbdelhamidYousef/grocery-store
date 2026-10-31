import type { AdminProduct } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { useAdminBrands, useAdminTags, useSetProductTags } from './merch-queries';
import { useUpdateAdminProduct } from './queries';

// The editorial side of a product: brand, the two manual badge flags, how long it counts as new,
// and its health-need tags. (New, Sale, Low stock are derived by the shop; they have no switches.)
// Saved on its own button so it never rides along with, or gets lost by, the main form.
export function ProductMerchandising({ product }: { product: AdminProduct }) {
  const toast = useToast();
  const { data: brands } = useAdminBrands();
  const { data: tags } = useAdminTags();
  const updateProduct = useUpdateAdminProduct(product.id);
  const setTags = useSetProductTags(product.id);
  const [brandId, setBrandId] = useState(product.brandId ?? '');
  const [isEco, setIsEco] = useState(product.isEco);
  const [bestseller, setBestseller] = useState(product.isBestsellerOverride);
  const [newUntil, setNewUntil] = useState(product.badgeNewUntil?.slice(0, 10) ?? '');
  const [tagIds, setTagIds] = useState(product.tags.map((t) => t.id));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    updateProduct.mutate(
      {
        brandId: brandId || null,
        isEco,
        isBestsellerOverride: bestseller,
        badgeNewUntil: newUntil ? new Date(`${newUntil}T00:00:00Z`).toISOString() : null,
      },
      {
        onSuccess: () =>
          setTags.mutate(tagIds, {
            onSuccess: () => toast.show('Merchandising saved', 'success'),
            onError: (err) => setError(adminErrorMessage(err)),
          }),
        onError: (err) => setError(adminErrorMessage(err)),
      },
    );
  };

  return (
    <section
      aria-labelledby="merch-heading"
      data-testid="product-merchandising"
      className="flex flex-col gap-4 rounded-card border border-line p-4"
    >
      <h3 id="merch-heading" className="font-display text-lg font-bold">
        Brand, badges and health needs
      </h3>
      <FormAlert message={error} />
      <Select label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
        <option value="">No brand</option>
        {brands?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <Checkbox label="Eco badge" checked={isEco} onChange={(e) => setIsEco(e.target.checked)} />
        <Checkbox
          label="Always show Bestseller"
          checked={bestseller}
          onChange={(e) => setBestseller(e.target.checked)}
        />
      </div>
      <Input
        label="Show the New badge until (optional)"
        type="date"
        hint="Without a date, a product is new for 30 days after it was added."
        value={newUntil}
        onChange={(e) => setNewUntil(e.target.value)}
      />
      <fieldset>
        <legend className="mb-1 font-semibold">Health needs</legend>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {tags?.map((t) => (
            <Checkbox
              key={t.id}
              label={t.name}
              checked={tagIds.includes(t.id)}
              onChange={(e) =>
                setTagIds((ids) =>
                  e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button onClick={save} loading={updateProduct.isPending || setTags.isPending}>
          Save merchandising
        </Button>
      </div>
    </section>
  );
}
