import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminProduct, CategoryNode } from '@store/shared';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';
import { applyFieldErrors } from '../auth/form-errors';
import { useCategories } from '../catalog/queries';

import { adminErrorMessage } from './errors';
import {
  emptyImageForm,
  emptyVariantForm,
  ProductFormSchema,
  productDefaults,
  STORAGE_OPTIONS,
  toCreatePayload,
  toUpdatePayload,
  type ProductFormInput,
  type ProductFormOutput,
} from './product-form';
import { useCreateAdminProduct, useUpdateAdminProduct } from './queries';
import { VariantFields, type VariantField } from './VariantFields';

// Products live in the leaf categories, so a parent that has children is not offered itself.
function categoryChoices(tree: CategoryNode[]): { id: string; label: string }[] {
  return tree.flatMap((parent) =>
    parent.children.length === 0
      ? [{ id: parent.id, label: parent.name }]
      : parent.children.map((child) => ({ id: child.id, label: `${parent.name} / ${child.name}` })),
  );
}

const FIELDS = ['name', 'description', 'categoryId', 'status'] as const;

// One form for "create" and "edit" (edit when `product` is given). Differences, on purpose:
// create takes the first variants inline because a product needs at least one; edit leaves the
// variants to their own table (VariantsSection), where each one is saved and its stock adjusted
// separately, so a 100-variant product is never one giant form.
export function ProductForm({
  product,
  onSaved,
}: {
  product?: AdminProduct;
  onSaved: (saved: AdminProduct) => void;
}) {
  const toast = useToast();
  const { data: categories } = useCategories();
  const create = useCreateAdminProduct();
  const update = useUpdateAdminProduct(product?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: productDefaults(product),
  });
  const images = useFieldArray({ control, name: 'images' });
  const variants = useFieldArray({ control, name: 'variants' });
  const isEdit = product !== undefined;
  const pending = create.isPending || update.isPending;

  // The SKUs an image can be tied to: the saved variants when editing, the typed ones when creating.
  const variantSkus = useWatch({ control, name: 'variants' });
  const skuChoices = isEdit
    ? product.variants.map((v) => v.sku)
    : variantSkus.map((v) => v.sku.trim()).filter(Boolean);

  const choices = useMemo(() => categoryChoices(categories ?? []), [categories]);
  // A product in a category the tree no longer offers (a parent) must still show its own value.
  const currentCategory = product?.category;

  const submit = handleSubmit((values) => {
    setFormError(null);
    const options = {
      onSuccess: (saved: AdminProduct) => {
        toast.show(isEdit ? 'Product saved' : 'Product created', 'success');
        onSaved(saved);
      },
      onError: (error: unknown) => {
        if (!applyFieldErrors(error, setError, FIELDS)) setFormError(adminErrorMessage(error));
      },
    };
    if (isEdit) update.mutate(toUpdatePayload(values), options);
    else create.mutate(toCreatePayload(values), options);
  });

  const variantErrors = (index: number): Partial<Record<VariantField, string | undefined>> => {
    const e = errors.variants?.[index];
    return {
      sku: e?.sku?.message,
      name: e?.name?.message,
      options: e?.options?.message,
      price: e?.price?.message,
      pricePerKg: e?.pricePerKg?.message,
      nominalGrams: e?.nominalGrams?.message,
      soldByWeight: undefined,
      compareAtPrice: e?.compareAtPrice?.message,
      memberPrice: e?.memberPrice?.message,
      weight: e?.weight?.message,
      deposit: e?.deposit?.message,
      stock: e?.stock?.message,
      lowStockThreshold: e?.lowStockThreshold?.message,
      status: e?.status?.message,
    };
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      data-testid={TEST_IDS.adminProductForm}
      className="flex flex-col gap-6"
    >
      <FormAlert message={formError} />

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg font-bold">Details</legend>
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Textarea
          label="Description"
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Keyed on the tree arriving: an uncontrolled select given its value before its options
              exist shows the placeholder, so the edit page would look like it lost the category. */}
          <Select
            key={categories ? 'ready' : 'loading'}
            label="Category"
            error={errors.categoryId?.message}
            {...register('categoryId')}
          >
            <option value="">Choose a category</option>
            {currentCategory && !choices.some((c) => c.id === currentCategory.id) && (
              <option value={currentCategory.id}>{currentCategory.name}</option>
            )}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select
            label="Status"
            hint="Only active products show in the shop."
            error={errors.status?.message}
            {...register('status')}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-1 font-display text-lg font-bold">Attributes</legend>
        <Select
          label="Storage"
          error={errors.attributes?.storage?.message}
          {...register('attributes.storage')}
        >
          <option value="">Not set</option>
          {STORAGE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Input
          label="Origin"
          error={errors.attributes?.origin?.message}
          {...register('attributes.origin')}
        />
        <Input
          label="Size"
          error={errors.attributes?.size?.message}
          {...register('attributes.size')}
        />
        <Input
          label="Option names"
          hint="The option keys every variant must use, for example Size, Colour"
          error={errors.attributes?.optionKeys?.message}
          {...register('attributes.optionKeys')}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-lg font-bold">Images</legend>
        <p className="text-sm text-muted">
          There is no upload: use a path under /products/ or an https:// link.
        </p>
        {images.fields.length === 0 && <p className="text-muted">No images yet.</p>}
        {images.fields.map((item, index) => {
          const e = errors.images?.[index];
          return (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 rounded-card border-2 border-line p-3 sm:grid-cols-2"
              role="group"
              aria-label={`Image ${index + 1}`}
            >
              <Input
                label="Image URL"
                error={e?.url?.message}
                {...register(`images.${index}.url` as const)}
              />
              <Input
                label="Alt text"
                error={e?.alt?.message}
                {...register(`images.${index}.alt` as const)}
              />
              <Input
                label="Width (px)"
                inputMode="numeric"
                error={e?.width?.message}
                {...register(`images.${index}.width` as const)}
              />
              <Input
                label="Height (px)"
                inputMode="numeric"
                error={e?.height?.message}
                {...register(`images.${index}.height` as const)}
              />
              <Select label="Shows variant" {...register(`images.${index}.variantSku` as const)}>
                <option value="">Whole product</option>
                {skuChoices.map((sku) => (
                  <option key={sku} value={sku}>
                    {sku}
                  </option>
                ))}
              </Select>
              <div className="flex items-end">
                <Button variant="ghost" onClick={() => images.remove(index)}>
                  Remove image {index + 1}
                </Button>
              </div>
            </div>
          );
        })}
        {errors.images?.message && (
          <p className="text-sm font-semibold text-danger">{errors.images.message}</p>
        )}
        <div>
          <Button
            variant="secondary"
            disabled={images.fields.length >= 20}
            onClick={() => images.append({ ...emptyImageForm })}
          >
            Add image
          </Button>
        </div>
      </fieldset>

      {!isEdit && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-lg font-bold">Variants</legend>
          <p className="text-sm text-muted">
            A product needs at least one. Pick which one opens first in the shop.
          </p>
          {variants.fields.map((item, index) => (
            <div
              key={item.id}
              role="group"
              aria-label={`Variant ${index + 1}`}
              data-testid={TEST_IDS.adminVariantForm}
              className="flex flex-col gap-3 rounded-card border-2 border-line p-3"
            >
              <VariantFields
                showStock
                weighed={variantSkus[index]?.soldByWeight === true}
                errors={variantErrors(index)}
                field={(name): UseFormRegisterReturn => register(`variants.${index}.${name}`)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    value={String(index)}
                    className="h-5 w-5 accent-primary"
                    {...register('defaultVariant')}
                  />
                  <span>Opens first in the shop</span>
                </label>
                <Button
                  variant="ghost"
                  disabled={variants.fields.length <= 1}
                  onClick={() => variants.remove(index)}
                >
                  Remove variant {index + 1}
                </Button>
              </div>
            </div>
          ))}
          {errors.variants?.message && (
            <p className="text-sm font-semibold text-danger">{errors.variants.message}</p>
          )}
          <div>
            <Button
              variant="secondary"
              disabled={variants.fields.length >= 60}
              onClick={() => variants.append({ ...emptyVariantForm })}
            >
              Add variant
            </Button>
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="submit" loading={pending} data-testid="admin-product-save">
          {isEdit ? 'Save product' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
