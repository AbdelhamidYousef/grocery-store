import { z } from 'zod';

// Delivery areas and dark stores (phase G4). A postcode belongs to exactly one area and an area is
// served by exactly one dark store, so a postcode decides which shelf a shopper buys from.

/** A German postcode is five digits. Kept as a string: a leading zero is part of it. */
export const postcodeSchema = z.string().regex(/^\d{5}$/, 'A postcode has five digits');

/** The central store: answers when there is no postcode yet, or the postcode is not served. */
export const DEFAULT_STORE_SLUG = 'mitte';

export const DeliveryStoreSchema = z.object({ slug: z.string(), name: z.string() });
export const DeliveryAreaRefSchema = z.object({ slug: z.string(), name: z.string() });

/** `GET /delivery/postcodes/:code`: served with its area and store, or just "not served". */
export const PostcodeLookupSchema = z.discriminatedUnion('served', [
  z.object({
    postcode: postcodeSchema,
    served: z.literal(true),
    area: DeliveryAreaRefSchema,
    store: DeliveryStoreSchema,
  }),
  z.object({ postcode: postcodeSchema, served: z.literal(false) }),
]);
export type PostcodeLookup = z.infer<typeof PostcodeLookupSchema>;

export const PostcodeLookupResponseSchema = z.object({ data: PostcodeLookupSchema });

export const DeliveryAreaSchema = z.object({
  slug: z.string(),
  name: z.string(),
  store: z.object({
    slug: z.string(),
    name: z.string(),
    street: z.string(),
    postalCode: z.string(),
  }),
  postcodes: z.array(z.string()),
});
export type DeliveryArea = z.infer<typeof DeliveryAreaSchema>;

export const DeliveryAreasResponseSchema = z.object({ data: z.array(DeliveryAreaSchema) });

export const PostcodeParamsSchema = z.object({ code: postcodeSchema });
