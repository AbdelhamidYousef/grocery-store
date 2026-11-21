import {
  AdminAttributesSchema,
  AdminImageInputSchema,
  AdminInventorySetSchema,
  AdminProductCreateSchema,
  AdminVariantInputSchema,
  ProductStatusSchema,
  type AdminImageInput,
  type AdminProduct,
  type AdminProductCreate,
  type AdminProductUpdate,
  type AdminVariant,
  type AdminVariantInput,
  type AdminVariantUpdate,
} from '@store/shared';
import { z } from 'zod';

import { centsToInput, inputToCents, inputToInt } from './money-input';

// The form holds TEXT (an <input> only ever gives strings); this file turns it into the numbers the
// API wants. Each field reuses the shared schema's own rule (max length, ranges, SKU pattern) by
// piping into it, so the form and the server cannot drift apart: the client shows the server's
// message before the request, and the server stays the one that has the last word.

const cents = (message: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const result = inputToCents(value);
      if (result === null) ctx.issues.push({ code: 'custom', message, input: value });
      return result ?? 0;
    });

const wholeNumber = (message: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const result = inputToInt(value);
      if (result === null) ctx.issues.push({ code: 'custom', message, input: value });
      return result ?? 0;
    });

// "Size=Large, Colour=Red" <-> { Size: 'Large', Colour: 'Red' }. A single text field instead of a
// key/value row editor: variants are edited in a table, and a row editor per variant would make a
// 60-variant product unusable on a phone.
export function parseOptions(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of text.split(',')) {
    if (part.trim() === '') continue;
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (!key || key.trim() === '' || value === '') return null;
    out[key.trim()] = value;
  }
  return out;
}

export function formatOptions(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

const options = z
  .string()
  .transform((value, ctx) => {
    const parsed = parseOptions(value);
    if (parsed === null) {
      ctx.issues.push({
        code: 'custom',
        message: 'Write options as Size=Large, Colour=Red',
        input: value,
      });
    }
    return parsed ?? {};
  })
  .pipe(AdminVariantInputSchema.shape.options);

const variantShape = AdminVariantInputSchema.shape;

export const VariantFormSchema = z
  .object({
    sku: z.string().pipe(variantShape.sku),
    name: z.string().pipe(variantShape.name),
    options,
    price: cents('Enter an amount like 12.99').pipe(variantShape.priceCents),
    compareAtPrice: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return null;
        const result = inputToCents(value);
        if (result === null) {
          ctx.issues.push({ code: 'custom', message: 'Enter an amount like 19.99', input: value });
        }
        return result;
      }),
    // Optional: empty = no member price. Parsed from the string with integer maths (inputToCents).
    memberPrice: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return null;
        const result = inputToCents(value);
        if (result === null || result < 1) {
          ctx.issues.push({ code: 'custom', message: 'Enter an amount like 9.99', input: value });
        }
        return result;
      }),
    weight: wholeNumber('Enter the weight in whole grams').pipe(variantShape.weightGrams),
    stock: wholeNumber('Enter a whole number').pipe(variantShape.stock.unwrap()),
    lowStockThreshold: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return undefined;
        const result = inputToInt(value);
        if (result === null) {
          ctx.issues.push({ code: 'custom', message: 'Enter a whole number', input: value });
        }
        return result ?? undefined;
      }),
    status: ProductStatusSchema,
  })
  .refine((v) => v.memberPrice === null || v.memberPrice < v.price, {
    message: 'The member price must be lower than the price',
    path: ['memberPrice'],
  })
  // Same rule as the server (and the same message), but on the field the person typed in.
  .refine((v) => v.compareAtPrice === null || v.compareAtPrice > v.price, {
    message: 'The strike-through price must be higher than the price',
    path: ['compareAtPrice'],
  });
export type VariantFormInput = z.input<typeof VariantFormSchema>;
export type VariantFormOutput = z.output<typeof VariantFormSchema>;

export const emptyVariantForm: VariantFormInput = {
  sku: '',
  name: '',
  options: '',
  price: '',
  compareAtPrice: '',
  memberPrice: '',
  weight: '',
  stock: '0',
  lowStockThreshold: '',
  status: 'active',
};

export function variantToForm(variant: AdminVariant): VariantFormInput {
  return {
    sku: variant.sku,
    name: variant.name,
    options: formatOptions(variant.options),
    price: centsToInput(variant.priceCents),
    compareAtPrice:
      variant.compareAtPriceCents === null ? '' : centsToInput(variant.compareAtPriceCents),
    memberPrice: variant.memberPriceCents === null ? '' : centsToInput(variant.memberPriceCents),
    weight: String(variant.weightGrams),
    stock: String(variant.quantity),
    lowStockThreshold: String(variant.lowStockThreshold),
    status: variant.status,
  };
}

export function variantToCreate(v: VariantFormOutput, isDefault: boolean): AdminVariantInput {
  return {
    sku: v.sku,
    name: v.name,
    options: v.options,
    priceCents: v.price,
    compareAtPriceCents: v.compareAtPrice,
    memberPriceCents: v.memberPrice,
    weightGrams: v.weight,
    isDefault,
    status: v.status,
    stock: v.stock,
    ...(v.lowStockThreshold !== undefined && { lowStockThreshold: v.lowStockThreshold }),
  };
}

// Stock is NOT part of a variant update: it changes only through the inventory endpoint, which
// records a reason.
export function variantToUpdate(v: VariantFormOutput): AdminVariantUpdate {
  return {
    sku: v.sku,
    name: v.name,
    options: v.options,
    priceCents: v.price,
    compareAtPriceCents: v.compareAtPrice,
    memberPriceCents: v.memberPrice,
    weightGrams: v.weight,
    status: v.status,
    ...(v.lowStockThreshold !== undefined && { lowStockThreshold: v.lowStockThreshold }),
  };
}

// ---------- images ----------

const imageShape = AdminImageInputSchema.shape;

export const ImageFormSchema = z.object({
  url: z.string().pipe(imageShape.url),
  alt: z.string().pipe(imageShape.alt),
  width: wholeNumber('Enter the width in pixels').pipe(imageShape.width),
  height: wholeNumber('Enter the height in pixels').pipe(imageShape.height),
  // '' means a plain product image; otherwise the SKU of the variant it shows.
  variantSku: z.string(),
});
export type ImageFormInput = z.input<typeof ImageFormSchema>;

export const emptyImageForm: ImageFormInput = {
  url: '/products/',
  alt: '',
  width: '1200',
  height: '1200',
  variantSku: '',
};

// ---------- product ----------

export const STORAGE_OPTIONS = ['ambient', 'chilled', 'frozen'] as const;

const AttributesTextSchema = z.object({
  storage: z.string(),
  origin: z.string().trim(),
  size: z.string().trim(),
  optionKeys: z.string().trim(),
});

// Text boxes for the facet attributes. An empty box means "no value", so the key is left out
// instead of sending an empty string the strict schema would refuse; the result is then piped
// through the shared strict schema, so a value outside the enums or over 60 characters fails on
// the field with the server's own message.
const AttributesFormSchema = AttributesTextSchema.transform((a) => {
  const keys = a.optionKeys
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    ...(a.storage && { storage: a.storage }),
    ...(a.origin && { origin: a.origin }),
    ...(a.size && { size: a.size }),
    ...(keys.length > 0 && { optionKeys: keys }),
  };
}).pipe(AdminAttributesSchema);

export const ProductFormSchema = z.object({
  name: z.string().pipe(AdminProductCreateSchema.shape.name),
  description: z.string().pipe(AdminProductCreateSchema.shape.description),
  categoryId: z
    .string()
    .min(1, 'Choose a category')
    .pipe(AdminProductCreateSchema.shape.categoryId),
  status: ProductStatusSchema,
  attributes: AttributesFormSchema,
  images: z.array(ImageFormSchema).max(20, 'At most 20 images'),
  // Create mode only: variants are edited in their own table afterwards.
  variants: z.array(VariantFormSchema).max(60, 'At most 60 variants on creation'),
  // Index (as text, because a radio group yields text) of the variant that opens first.
  defaultVariant: z.string(),
});
export type ProductFormInput = z.input<typeof ProductFormSchema>;
export type ProductFormOutput = z.output<typeof ProductFormSchema>;

export function productDefaults(product?: AdminProduct): ProductFormInput {
  const attrs = product?.attributes ?? {};
  const text = (key: string) => (typeof attrs[key] === 'string' ? attrs[key] : '');
  const skuById = new Map((product?.variants ?? []).map((v) => [v.id, v.sku]));
  const keys = Array.isArray(attrs.optionKeys) ? attrs.optionKeys.map(String) : [];
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    categoryId: product?.category.id ?? '',
    status: product?.status ?? 'draft',
    attributes: {
      storage: text('storage'),
      origin: text('origin'),
      size: text('size'),
      optionKeys: keys.join(', '),
    },
    images: (product?.images ?? []).map((image) => ({
      url: image.url,
      alt: image.alt,
      width: String(image.width),
      height: String(image.height),
      variantSku: (image.variantId && skuById.get(image.variantId)) || '',
    })),
    variants: product ? [] : [{ ...emptyVariantForm }],
    defaultVariant: '0',
  };
}

function toImages(images: ProductFormOutput['images']): AdminImageInput[] {
  return images.map((image) => ({
    url: image.url,
    alt: image.alt,
    width: image.width,
    height: image.height,
    ...(image.variantSku && { variantSku: image.variantSku }),
  }));
}

export function toCreatePayload(form: ProductFormOutput): AdminProductCreate {
  // A removed row can leave the radio pointing past the end: fall back to the first variant.
  const picked = Number(form.defaultVariant);
  const defaultIndex = picked < form.variants.length ? picked : 0;
  return {
    name: form.name,
    description: form.description,
    categoryId: form.categoryId,
    status: form.status,
    attributes: form.attributes,
    images: toImages(form.images),
    variants: form.variants.map((v, i) => variantToCreate(v, i === defaultIndex)),
  };
}

export function toUpdatePayload(form: ProductFormOutput): AdminProductUpdate {
  return {
    name: form.name,
    description: form.description,
    categoryId: form.categoryId,
    status: form.status,
    attributes: form.attributes,
    images: toImages(form.images),
  };
}

// ---------- stock ----------

export const StockFormSchema = z.object({
  // The dark store whose shelf is counted (one stock row per store).
  storeId: z.string().min(1),
  quantity: wholeNumber('Enter a whole number').pipe(AdminInventorySetSchema.shape.quantity),
  lowStockThreshold: wholeNumber('Enter a whole number').pipe(
    AdminInventorySetSchema.shape.lowStockThreshold.unwrap(),
  ),
  reason: AdminInventorySetSchema.shape.reason,
  note: z.string().pipe(AdminInventorySetSchema.shape.note.unwrap()).or(z.literal('')),
});
export type StockFormInput = z.input<typeof StockFormSchema>;
