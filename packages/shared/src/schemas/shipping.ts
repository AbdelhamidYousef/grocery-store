import { z } from 'zod';

import { DataSchema } from './common.ts';

// The shop ships inside Europe and to the UK only (each store view ships to its own subset, see
// `STORES[].shipCountries`). A short allow-list (instead of "any ISO code") keeps the
// address form a dropdown and means we never quote or accept an order we cannot deliver.
export const SUPPORTED_COUNTRIES = [
  'AT',
  'BE',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'IE',
  'IT',
  'LT',
  'LV',
  'NL',
  'PL',
  'PT',
  'SE',
] as const;
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export const CountrySchema = z
  .string()
  .trim()
  // Upper-cased before the enum check so "de" and "DE" are the same country.
  .transform((v) => v.toUpperCase())
  .pipe(z.enum(SUPPORTED_COUNTRIES, 'We do not ship to this country'));

export const ShippingMethodsQuerySchema = z.object({ country: CountrySchema });

export const ShippingQuoteSchema = z.object({
  code: z.string(),
  name: z.string(),
  // Already includes the free-shipping rule: 0 when the subtotal qualifies.
  priceCents: z.number().int().min(0),
  free: z.boolean(),
  // The subtotal from which this method is free, or null when it never is. Lets the cart show
  // "add X more for free shipping" from the API's own rule instead of a copy of the number.
  freeOverCents: z.number().int().min(0).nullable(),
  currency: z.string().length(3),
  etaDaysMin: z.number().int().min(0),
  etaDaysMax: z.number().int().min(0),
});
export type ShippingQuote = z.infer<typeof ShippingQuoteSchema>;

export const ShippingMethodsResponseSchema = DataSchema(z.array(ShippingQuoteSchema));

// What the product page needs to estimate arrival: each active method's transit range in business
// days, and the server's clock (a device with a wrong clock must not decide "before the cutoff").
export const DeliveryMethodSchema = z.object({
  code: z.string(),
  name: z.string(),
  etaDaysMin: z.number().int().min(0),
  etaDaysMax: z.number().int().min(0),
});
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>;
export const DeliveryMethodsResponseSchema = DataSchema(
  z.object({ serverNow: z.iso.datetime(), methods: z.array(DeliveryMethodSchema) }),
);
export type DeliveryMethodsResponse = z.infer<typeof DeliveryMethodsResponseSchema>;
