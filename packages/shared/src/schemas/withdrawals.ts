import { z } from 'zod';

import { DataSchema, optionalText } from './common.ts';

// ---------- EU right of withdrawal (public form) ----------

export const WithdrawalBodySchema = z.object({
  // Loose on purpose, like order tracking: a malformed pair must get the same 404 as a wrong one.
  orderNumber: z.string().trim().min(1).max(40),
  email: z.string().trim().min(1).max(254),
  // "Everything" or which items, in the customer's words.
  itemsText: optionalText(500),
  reason: optionalText(1000),
});
export type WithdrawalBody = z.infer<typeof WithdrawalBodySchema>;

export const WithdrawalReceiptSchema = z.object({
  reference: z.string(),
  orderNumber: z.string(),
  requestedAt: z.string(),
});
export type WithdrawalReceipt = z.infer<typeof WithdrawalReceiptSchema>;
export const WithdrawalResponseSchema = DataSchema(WithdrawalReceiptSchema);

// ---------- admin queue ----------

export const WithdrawalStatusSchema = z.enum(['new', 'acknowledged', 'done']);
export type WithdrawalStatus = z.infer<typeof WithdrawalStatusSchema>;

export const AdminWithdrawalSchema = z.object({
  id: z.string(),
  reference: z.string(),
  orderNumber: z.string(),
  email: z.string(),
  itemsText: z.string().nullable(),
  reason: z.string().nullable(),
  status: WithdrawalStatusSchema,
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
});
export type AdminWithdrawal = z.infer<typeof AdminWithdrawalSchema>;
export const AdminWithdrawalListResponseSchema = DataSchema(z.array(AdminWithdrawalSchema));
export const AdminWithdrawalResponseSchema = DataSchema(AdminWithdrawalSchema);
export const AdminWithdrawalUpdateSchema = z.object({ status: WithdrawalStatusSchema });
export type AdminWithdrawalUpdate = z.infer<typeof AdminWithdrawalUpdateSchema>;
