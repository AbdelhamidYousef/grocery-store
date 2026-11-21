import type { UseFormRegisterReturn } from 'react-hook-form';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

import type { VariantFormInput } from './product-form';

export type VariantField = keyof VariantFormInput;

// The inputs of one variant, used by the create form (one block per variant) and by the edit
// dialog. It takes a `field` function instead of a form, so it does not care whether the values
// live at `variants.3.sku` or at `sku`.
export function VariantFields({
  field,
  errors,
  showStock,
  weighed,
}: {
  field: (name: VariantField) => UseFormRegisterReturn;
  errors: Partial<Record<VariantField, string | undefined>>;
  /** Stock is typed only when creating; afterwards it changes through "Adjust stock". */
  showStock: boolean;
  /** The "sold by weight" box is ticked: the price per kilogram replaces the typed price. */
  weighed: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input label="SKU" error={errors.sku} {...field('sku')} />
      <Input label="Variant name" error={errors.name} {...field('name')} />
      <div className="sm:col-span-2">
        <Input
          label="Options"
          hint="For example Size=Large, Colour=Red"
          error={errors.options}
          {...field('options')}
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 sm:col-span-2">
        <input type="checkbox" className="h-5 w-5 accent-primary" {...field('soldByWeight')} />
        <span>Sold by weight (loose fruit, counter cheese)</span>
      </label>
      {weighed ? (
        <>
          <Input
            label="Price per kilogram"
            inputMode="decimal"
            hint="In euros, for example 3.78; the unit price follows from it"
            error={errors.pricePerKg}
            {...field('pricePerKg')}
          />
          <Input
            label="Weight of one unit (grams)"
            inputMode="numeric"
            hint='The "about 500 g" the shopper adds to the basket'
            error={errors.nominalGrams}
            {...field('nominalGrams')}
          />
        </>
      ) : (
        <Input
          label="Price"
          inputMode="decimal"
          hint="In euros, for example 12.99"
          error={errors.price}
          {...field('price')}
        />
      )}
      <Input
        label="Strike-through price (optional)"
        inputMode="decimal"
        error={errors.compareAtPrice}
        {...field('compareAtPrice')}
      />
      <Input
        label="Member price (optional)"
        inputMode="decimal"
        hint="In euros, lower than the price; only signed-in shoppers get it"
        error={errors.memberPrice}
        {...field('memberPrice')}
      />
      <Input
        label="Bottle deposit (optional)"
        inputMode="decimal"
        hint="In euros per unit, for example 0.25; charged on top, never discounted"
        error={errors.deposit}
        {...field('deposit')}
      />
      <Input
        label="Weight (grams)"
        inputMode="numeric"
        error={errors.weight}
        {...field('weight')}
      />
      <Input
        label="Low-stock alert at (optional)"
        inputMode="numeric"
        error={errors.lowStockThreshold}
        {...field('lowStockThreshold')}
      />
      {showStock && (
        <Input label="Opening stock" inputMode="numeric" error={errors.stock} {...field('stock')} />
      )}
      <Select label="Variant status" error={errors.status} {...field('status')}>
        <option value="active">Active</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </Select>
    </div>
  );
}
