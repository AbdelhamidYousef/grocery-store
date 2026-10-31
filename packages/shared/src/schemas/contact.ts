import { z } from 'zod';

import { EmailSchema } from './auth.ts';
import { DataSchema, requiredText } from './common.ts';

// ---------- contact form ----------

export const CONTACT_TOPICS = [
  'order',
  'shipping',
  'returns',
  'product',
  'account',
  'privacy',
  'other',
] as const;
export const ContactTopicSchema = z.enum(CONTACT_TOPICS);
export type ContactTopic = z.infer<typeof ContactTopicSchema>;

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  order: 'My order',
  shipping: 'Shipping and delivery',
  returns: 'Returns and refunds',
  product: 'A product',
  account: 'My account',
  privacy: 'My data and privacy',
  other: 'Something else',
};

export const ContactBodySchema = z.object({
  name: requiredText(100),
  email: EmailSchema,
  topic: ContactTopicSchema,
  // Optional and never verified: it only helps whoever answers find the order.
  orderNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(2000),
  // Honeypot: a field real visitors never see or fill. A bot that fills every input fills this
  // one, and the API then pretends success without storing or sending anything.
  website: z.string().max(200).optional(),
});
export type ContactBody = z.infer<typeof ContactBodySchema>;

export const ContactReceiptSchema = z.object({ reference: z.string() });
export const ContactResponseSchema = DataSchema(ContactReceiptSchema);
export type ContactReceipt = z.infer<typeof ContactReceiptSchema>;

// ---------- admin ----------

export const AdminContactMessageSchema = z.object({
  id: z.string(),
  reference: z.string(),
  name: z.string(),
  email: z.string(),
  topic: ContactTopicSchema,
  orderNumber: z.string().nullable(),
  message: z.string(),
  createdAt: z.string(),
  handledAt: z.string().nullable(),
});
export type AdminContactMessage = z.infer<typeof AdminContactMessageSchema>;
export const AdminContactListResponseSchema = DataSchema(z.array(AdminContactMessageSchema));
export const AdminContactResponseSchema = DataSchema(AdminContactMessageSchema);
export const AdminContactUpdateSchema = z.object({ handled: z.boolean() });
export type AdminContactUpdate = z.infer<typeof AdminContactUpdateSchema>;
