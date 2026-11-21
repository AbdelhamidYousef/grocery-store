import type {
  Address,
  CustomerOrder,
  AddressInputSchema,
  AddressUpdateSchema,
  ChangePasswordSchema,
  OrderSummary,
  SubstitutionSettings,
  UpdateProfileSchema,
  User,
} from '@store/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '../../db/client.ts';
import { users } from '../../db/schema/index.ts';
import { notFound, validation } from '../../lib/errors.ts';
import { hash, verify } from '../auth/password.ts';
import * as authRepo from '../auth/repo.ts';
import { deleteOtherSessions } from '../auth/sessions.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { toOrderDto } from '../orders/view.ts';

import * as repo from './repo.ts';

const toUser = (row: NonNullable<Awaited<ReturnType<typeof repo.updateUserNames>>>): User => ({
  id: row.id,
  email: row.email,
  firstName: row.firstName,
  lastName: row.lastName,
  role: row.role,
});

export async function updateProfile(
  userId: string,
  input: z.output<typeof UpdateProfileSchema>,
): Promise<User> {
  const row = await repo.updateUserNames(userId, input);
  if (!row) throw notFound('Account not found');
  return toUser(row);
}

export async function getSubstitutionSettings(userId: string): Promise<SubstitutionSettings> {
  const [row] = await db
    .select({ pref: users.defaultSubstitution })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw notFound('Account not found');
  // The column shares the cart's enum, but a default can never be one particular product.
  return { defaultSubstitution: row.pref === 'none' ? 'none' : 'best_match' };
}

export async function setSubstitutionSettings(
  userId: string,
  defaultSubstitution: SubstitutionSettings['defaultSubstitution'],
): Promise<SubstitutionSettings> {
  const rows = await db
    .update(users)
    .set({ defaultSubstitution })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (rows.length === 0) throw notFound('Account not found');
  return { defaultSubstitution };
}

export async function changePassword(
  userId: string,
  input: z.output<typeof ChangePasswordSchema>,
  currentToken: string,
): Promise<void> {
  const row = await authRepo.findUserById(userId);
  if (!row) throw notFound('Account not found');
  if (!(await verify(row.passwordHash, input.currentPassword))) {
    // 400 with a field error, not 401: the user IS signed in, and the web client reads 401 as
    // "session expired, go to login". Same shape as Zod failures so the form maps it to the field.
    throw validation({
      formErrors: [],
      fieldErrors: { currentPassword: ['Current password is incorrect'] },
    });
  }
  await repo.updatePasswordHash(userId, await hash(input.newPassword));
  // Anyone else holding a session (a thief who knew the old password, a forgotten laptop) is
  // signed out; this device stays signed in.
  await deleteOtherSessions(userId, currentToken);
}

// ---------- addresses ----------

const toAddress = (row: repo.AddressRow): Address => ({
  id: row.id,
  label: row.label,
  fullName: row.fullName,
  line1: row.line1,
  line2: row.line2,
  city: row.city,
  region: row.region,
  postalCode: row.postalCode,
  country: row.country,
  phone: row.phone,
  isDefaultShipping: row.isDefaultShipping,
  isDefaultBilling: row.isDefaultBilling,
});

export async function listAddresses(userId: string): Promise<Address[]> {
  return (await repo.listAddresses(userId)).map(toAddress);
}

export async function createAddress(
  userId: string,
  input: z.output<typeof AddressInputSchema>,
): Promise<Address> {
  return db.transaction(async (tx) => {
    await repo.lockUser(tx, userId);
    // The very first address becomes the default for both kinds unless the caller said otherwise:
    // checkout then has something to pre-fill with no extra click.
    const isFirst = (await repo.countAddresses(tx, userId)) === 0;
    const shipping = input.isDefaultShipping ?? isFirst;
    const billing = input.isDefaultBilling ?? isFirst;
    // Clear the old default BEFORE inserting the new one, or the partial unique index rejects it.
    if (shipping) await repo.clearDefault(tx, userId, 'shipping');
    if (billing) await repo.clearDefault(tx, userId, 'billing');
    const row = await repo.insertAddress(tx, userId, {
      ...input,
      isDefaultShipping: shipping,
      isDefaultBilling: billing,
    });
    return toAddress(row);
  });
}

export async function updateAddress(
  userId: string,
  id: string,
  input: z.output<typeof AddressUpdateSchema>,
): Promise<Address> {
  return db.transaction(async (tx) => {
    await repo.lockUser(tx, userId);
    // Making another address the default demotes the current one first (same unique-index reason).
    if (input.isDefaultShipping) await repo.clearDefault(tx, userId, 'shipping', id);
    if (input.isDefaultBilling) await repo.clearDefault(tx, userId, 'billing', id);
    // Undefined fields are dropped by Drizzle's `set`, which is exactly PATCH semantics.
    const row = await repo.updateAddress(tx, userId, id, input);
    // Throwing rolls the demotion back, so a request for someone else's id changes nothing at all.
    if (!row) throw notFound('Address not found');
    return toAddress(row);
  });
}

// Deleting a default leaves the user with no default of that kind rather than promoting another
// address behind their back; the web shows "set as default" on the remaining ones.
export async function deleteAddress(userId: string, id: string): Promise<void> {
  if (!(await repo.deleteAddress(userId, id))) throw notFound('Address not found');
}

// ---------- orders ----------

export async function listOrders(userId: string, page: number, limit: number) {
  const { rows, total } = await repo.listOrders(userId, page, limit);
  const items = await repo.listItemsForOrders(rows.map((o) => o.id));
  const data: OrderSummary[] = rows.map((o) => {
    const lines = items.filter((i) => i.orderId === o.id);
    return {
      number: o.number,
      status: o.status,
      totalCents: o.totalCents,
      currency: o.currency,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      thumbnails: lines.flatMap((l) => (l.imageUrl ? [l.imageUrl] : [])).slice(0, 4),
      placedAt: o.placedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// The signed-in customer's own order with a timeline. History rows that did not change the status
// (an amount-mismatch or late-payment note is recorded as from == to) are internal alarms and are
// left out, as are actors and notes.
export async function getOrder(userId: string, number: string): Promise<CustomerOrder> {
  const order = await repo.findOwnOrder(userId, number);
  if (!order) throw notFound('Order not found');
  const [items, payment, history] = await Promise.all([
    checkoutRepo.listOrderItems(db, order.id),
    checkoutRepo.findPaymentByOrder(db, order.id),
    repo.listStatusHistory(order.id),
  ]);
  return {
    ...toOrderDto(order, items, payment),
    timeline: history
      .filter((h) => h.fromStatus !== h.toStatus)
      .map((h) => ({ status: h.toStatus, at: h.createdAt.toISOString() })),
  };
}
