import { z } from 'zod';

import { NewPasswordSchema, UserSchema } from './auth.ts';
import { OrderSchema, OrderStatusSchema } from './checkout.ts';
import { DataSchema, optionalText, PaginatedSchema, requiredText } from './common.ts';

// ---------- profile and password ----------

const NameSchema = z.string().trim().min(1, 'Required').max(80);

// PATCH semantics: send only what changes, but send something.
export const UpdateProfileSchema = z
  .object({ firstName: NameSchema, lastName: NameSchema })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type UpdateProfileInput = z.input<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required').max(128),
    newPassword: NewPasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password you are not using now',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.input<typeof ChangePasswordSchema>;

export const ProfileResponseSchema = DataSchema(z.object({ user: UserSchema }));

// ---------- addresses ----------

export const AddressInputSchema = z.object({
  label: optionalText(40),
  fullName: requiredText(120),
  line1: requiredText(160),
  line2: optionalText(160),
  city: requiredText(100),
  region: optionalText(100),
  postalCode: requiredText(20),
  // ISO 3166-1 alpha-2; stored upper-case so "de" and "DE" are the same country.
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code')
    .transform((v) => v.toUpperCase()),
  phone: optionalText(30),
  // Omitted on the first address means "make it the default"; see the account service.
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
});
export type AddressInput = z.input<typeof AddressInputSchema>;

export const AddressUpdateSchema = AddressInputSchema.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Nothing to update',
);
export type AddressUpdateInput = z.input<typeof AddressUpdateSchema>;

export const AddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  postalCode: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
  isDefaultShipping: z.boolean(),
  isDefaultBilling: z.boolean(),
});
export type Address = z.infer<typeof AddressSchema>;

export const AddressResponseSchema = DataSchema(AddressSchema);
export const AddressListResponseSchema = DataSchema(z.array(AddressSchema));

export const IdParamsSchema = z.object({ id: z.uuid() });

// ---------- order history ----------

export const OrderSummarySchema = z.object({
  number: z.string(),
  status: OrderStatusSchema,
  totalCents: z.number().int().min(0),
  currency: z.string().length(3),
  // Units across all lines, for "3 items" in the list.
  itemCount: z.number().int().min(0),
  // Up to four product image URLs for the thumbnail strip (lines without an image are skipped).
  thumbnails: z.array(z.string()).max(4),
  placedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const OrderListResponseSchema = PaginatedSchema(OrderSummarySchema);

// One step of the customer-visible timeline: WHAT happened and WHEN. The audit log's actor and
// note stay internal (they hold admin emails and free text), so they are not part of this shape.
export const OrderTimelineEntrySchema = z.object({
  status: OrderStatusSchema,
  at: z.string(),
});
export type OrderTimelineEntry = z.infer<typeof OrderTimelineEntrySchema>;

// The order page of a signed-in customer: the full order plus its timeline, oldest first.
export const CustomerOrderSchema = OrderSchema.extend({
  timeline: z.array(OrderTimelineEntrySchema),
});
export type CustomerOrder = z.infer<typeof CustomerOrderSchema>;

export const CustomerOrderResponseSchema = DataSchema(CustomerOrderSchema);
