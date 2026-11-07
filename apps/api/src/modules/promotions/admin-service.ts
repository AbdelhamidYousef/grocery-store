import {
  ErrorCode,
  type AdminBulkTier,
  type AdminBulkTierInput,
  type AdminDiscountCode,
  type AdminDiscountCodeParsed,
  type AdminGiftRule,
} from '@store/shared';

import { uniqueViolation } from '../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../lib/errors.ts';

import * as repo from './admin-repo.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CodeRowShape = NonNullable<Awaited<ReturnType<typeof repo.getCode>>>;

const toCode = (r: CodeRowShape): AdminDiscountCode => ({
  ...r,
  startsAt: r.startsAt?.toISOString() ?? null,
  endsAt: r.endsAt?.toISOString() ?? null,
  archivedAt: r.archivedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

const toValues = (input: AdminDiscountCodeParsed): repo.CodeValues => ({
  ...input,
  startsAt: input.startsAt ? new Date(input.startsAt) : null,
  endsAt: input.endsAt ? new Date(input.endsAt) : null,
});

// The unique index is on the citext column, so "paws10" and "PAWS10" collide here too. Mapping
// the violation (not only pre-checking) also covers two admins saving the same code at once.
async function mapDuplicate<T>(work: () => Promise<T>, message: string): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (uniqueViolation(err) !== undefined) throw conflict(ErrorCode.CONFLICT, message);
    throw err;
  }
}

const DUPLICATE_CODE = 'A code with that name already exists (codes are not case-sensitive).';

export async function listCodes(): Promise<AdminDiscountCode[]> {
  return (await repo.listCodes()).map(toCode);
}

export async function createCode(input: AdminDiscountCodeParsed): Promise<AdminDiscountCode> {
  const id = await mapDuplicate(() => repo.insertCode(toValues(input)), DUPLICATE_CODE);
  return getCode(id);
}

export async function getCode(id: string): Promise<AdminDiscountCode> {
  const row = await repo.getCode(id);
  if (!row) throw notFound('Discount code not found');
  return toCode(row);
}

export async function updateCode(
  id: string,
  input: AdminDiscountCodeParsed,
): Promise<AdminDiscountCode> {
  const found = await mapDuplicate(() => repo.updateCode(id, toValues(input)), DUPLICATE_CODE);
  if (!found) throw notFound('Discount code not found');
  return getCode(id);
}

// "Delete" keeps history: a code that any order ever used is archived (it stops working and
// leaves the active list), one that was never used is removed for good.
export async function deleteCode(id: string): Promise<'deleted' | 'archived'> {
  await getCode(id);
  if ((await repo.redemptionRows(id)) > 0) {
    await repo.archiveCode(id);
    return 'archived';
  }
  await repo.deleteCode(id);
  return 'deleted';
}

// ----- bulk tiers -----
const DUPLICATE_TIER = 'There is already a tier for that spend. Edit it instead.';

const toTier = (r: {
  id: string;
  minCents: number;
  percent: number;
  active: boolean;
}): AdminBulkTier => ({
  id: r.id,
  minCents: r.minCents,
  percent: r.percent,
  active: r.active,
});

export async function listTiers() {
  return (await repo.listTiers()).map(toTier);
}
export async function createTier(input: Required<AdminBulkTierInput>) {
  return toTier(await mapDuplicate(() => repo.insertTier(input), DUPLICATE_TIER));
}
export async function updateTier(id: string, input: Required<AdminBulkTierInput>) {
  const row = await mapDuplicate(() => repo.updateTier(id, input), DUPLICATE_TIER);
  if (!row) throw notFound('Tier not found');
  return toTier(row);
}
export async function deleteTier(id: string) {
  if (!(await repo.deleteTier(id))) throw notFound('Tier not found');
}

// ----- gift rule -----
export const getGiftRule = async (): Promise<AdminGiftRule | null> =>
  (await repo.activeGiftRule()) ?? null;

export async function setGiftRule(input: {
  thresholdCents: number;
  variant: string;
}): Promise<AdminGiftRule> {
  const variant = await repo.findVariant(
    UUID.test(input.variant) ? { id: input.variant } : { sku: input.variant },
  );
  if (!variant) {
    throw validation({
      formErrors: [],
      fieldErrors: { variant: ['No variant has that SKU or id'] },
    });
  }
  if (variant.status !== 'active' || variant.productStatus !== 'active') {
    throw validation({
      formErrors: [],
      fieldErrors: { variant: ['That variant is not active, so it cannot be given away'] },
    });
  }
  await mapDuplicate(
    () => repo.setGiftRule(input.thresholdCents, variant.id),
    'Another admin just set a gift rule. Reload and try again.',
  );
  const rule = await repo.activeGiftRule();
  return rule!;
}

export async function clearGiftRule(): Promise<void> {
  if ((await repo.clearGiftRule()) === 0) throw notFound('There is no active gift rule');
}
