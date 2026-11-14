import { z } from 'zod';

import { PET_VALUES } from '../pets.ts';

import { EmailSchema } from './auth.ts';
import { DataSchema } from './common.ts';

// ---------- newsletter (double opt-in) ----------

/** The exact sentence the subscriber agrees to; stored with the row as proof of what they saw. */
export const NEWSLETTER_CONSENT_TEXT =
  'Send me Grocery news and offers. I can unsubscribe with one click at any time.';

export const NEWSLETTER_CONFIRM_HOURS = 48;
export const WELCOME_CODE_PERCENT = 10;
export const WELCOME_CODE_DAYS = 30;

export const NewsletterSubscribeSchema = z.object({
  email: EmailSchema,
  pets: z.array(z.enum(PET_VALUES)).max(PET_VALUES.length).default([]),
  // Consent must be an explicit yes: an unticked or missing box is a validation error.
  consent: z.literal(true, { error: 'Please tick the box to subscribe' }),
  // Honeypot, same idea as the contact form.
  website: z.string().max(200).optional(),
});
export type NewsletterSubscribeInput = z.input<typeof NewsletterSubscribeSchema>;

// The same answer for a new, a pending, a confirmed and an unsubscribed address: the form never
// reveals whether an address is already on the list.
export const NewsletterSubscribeResponseSchema = DataSchema(
  z.object({ status: z.literal('check_your_inbox') }),
);

export const NewsletterTokenSchema = z.object({ token: z.string().min(16).max(128) });

export const NewsletterConfirmResponseSchema = DataSchema(
  z.object({ status: z.enum(['confirmed', 'already_confirmed']) }),
);
export const NewsletterUnsubscribeResponseSchema = DataSchema(
  z.object({ status: z.literal('unsubscribed') }),
);
