import { CheckoutRequestSchema, SUPPORTED_COUNTRIES, type Address, type User } from '@store/shared';
import { z } from 'zod';

import { countryName } from '../../lib/countries';

// Step 1 is "who and where": the contact email and the shipping address, validated with the very
// schemas the API uses (a rule changed there changes here). Billing is "same as shipping" and
// notes are not offered yet, so the request stays small.
export const DetailsSchema = CheckoutRequestSchema.pick({
  email: true,
  shippingAddress: true,
});
export type DetailsInput = z.input<typeof DetailsSchema>;
export type Details = z.output<typeof DetailsSchema>;

// The checkout only ships to this list (the API refuses the rest), unlike the account address form
// which offers more countries.
// Names and their order follow the store's locale; the codes stay the values.
export const shippingCountries = (
  locale: string,
  allowed: readonly string[] = SUPPORTED_COUNTRIES,
) =>
  SUPPORTED_COUNTRIES.filter((code) => allowed.includes(code))
    .map((code) => ({
      code,
      name: countryName(code, locale),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

// Pre-fills the form for a signed-in shopper from their account and default shipping address.
// A saved address in a country this store does not ship to is not offered (the shopper picks one).
const isSupported = (code: string) => (SUPPORTED_COUNTRIES as readonly string[]).includes(code);

export function detailsDefaults(
  user: User | null,
  addresses: Address[] | undefined,
  allowed: readonly string[] = SUPPORTED_COUNTRIES,
): DetailsInput {
  const saved = addresses?.find((a) => a.isDefaultShipping) ?? addresses?.[0];
  return {
    email: user?.email ?? '',
    shippingAddress: {
      fullName: saved?.fullName ?? (user ? `${user.firstName} ${user.lastName}`.trim() : ''),
      line1: saved?.line1 ?? '',
      line2: saved?.line2 ?? '',
      city: saved?.city ?? '',
      region: saved?.region ?? '',
      postalCode: saved?.postalCode ?? '',
      country:
        saved && allowed.includes(saved.country) && isSupported(saved.country)
          ? saved.country
          : allowed.includes('DE')
            ? 'DE'
            : (allowed.find(isSupported) ?? 'DE'),
      phone: saved?.phone ?? '',
    },
  };
}

// Form input from a validated result: empty optional fields came back as null, inputs want ''.
export function toInput(details: Details): DetailsInput {
  const a = details.shippingAddress;
  return {
    email: details.email,
    shippingAddress: {
      ...a,
      line2: a.line2 ?? '',
      region: a.region ?? '',
      phone: a.phone ?? '',
    },
  };
}
