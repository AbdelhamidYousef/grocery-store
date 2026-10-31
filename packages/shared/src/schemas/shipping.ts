import { z } from 'zod';

import { DataSchema } from './common.ts';

// The shop ships inside Europe only. A short allow-list (instead of "any ISO code") keeps the
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
  currency: z.string().length(3),
  etaDaysMin: z.number().int().min(0),
  etaDaysMax: z.number().int().min(0),
});
export type ShippingQuote = z.infer<typeof ShippingQuoteSchema>;

export const ShippingMethodsResponseSchema = DataSchema(z.array(ShippingQuoteSchema));
