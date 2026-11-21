import {
  AdminHomeContentSchema,
  ErrorCode,
  HeroSlidesSchema,
  PromoTileSchema,
  type AdminContactMessage,
  type AdminGuide,
  type AdminGuideRow,
  type AdminHelpArticle,
  type AdminHomeContent,
  type AdminTestimonial,
  type AdminWithdrawal,
  type HomeContentKey,
  type WithdrawalStatus,
} from '@store/shared';
import type {
  AdminGuideInputSchema,
  AdminHelpInputSchema,
  AdminTestimonialInputSchema,
} from '@store/shared';
import type { z } from 'zod';

import { db } from '../../../db/client.ts';
import { uniqueViolation } from '../../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../../lib/errors.ts';
import { slugify } from '../../../lib/slug.ts';
import { contactReference } from '../../contact/service.ts';
import { getHomeContent, putHomeContent } from '../../home/content.ts';
import { referenceOf } from '../../withdrawals/service.ts';

import * as repo from './repo.ts';

type GuideInput = z.output<typeof AdminGuideInputSchema>;
type HelpInput = z.output<typeof AdminHelpInputSchema>;
type TestimonialInput = z.output<typeof AdminTestimonialInputSchema>;

const fieldError = (field: string, message: string) =>
  validation({ formErrors: [], fieldErrors: { [field]: [message] } });

// A race on a unique slug (two admins saving the same title at once) becomes the same friendly
// 409 as the normal check, not a 500.
async function mapSlugConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (uniqueViolation(err)?.includes('slug') === true) {
      throw conflict(
        ErrorCode.CONFLICT,
        'That slug is already used. Change the title or the slug.',
      );
    }
    throw err;
  }
}

// ---------- guides ----------

const toGuideRow = (r: Awaited<ReturnType<typeof repo.listGuides>>[number]): AdminGuideRow => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  category: r.category,
  status: r.status,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  updatedAt: r.updatedAt.toISOString(),
});

export async function listGuides(): Promise<AdminGuideRow[]> {
  return (await repo.listGuides()).map(toGuideRow);
}

export async function getGuide(id: string): Promise<AdminGuide> {
  const row = await repo.findGuide(id);
  if (!row) throw notFound('Guide not found');
  return {
    ...toGuideRow(row),
    summary: row.summary,
    bodyMd: row.bodyMd,
    coverUrl: row.coverUrl,
    products: await repo.listGuideProducts(id),
  };
}

// Publishing sets the date to "now" unless one was given or already exists; a draft keeps whatever
// date it had so unpublishing and republishing does not rewrite history.
function publishDate(input: GuideInput, existing: Date | null): Date | null {
  const given = input.publishedAt ? new Date(input.publishedAt) : null;
  if (input.status === 'published') return given ?? existing ?? new Date();
  return given ?? existing;
}

async function saveGuide(id: string | null, input: GuideInput): Promise<string> {
  return mapSlugConflict(() =>
    db.transaction(async (tx) => {
      if ((await repo.countProducts(input.productIds, tx)) !== new Set(input.productIds).size) {
        throw fieldError('productIds', 'One of the chosen products no longer exists');
      }
      const existing = id ? await repo.findGuide(id, tx) : undefined;
      if (id && !existing) throw notFound('Guide not found');
      const categoryId = await repo.upsertCategory(tx, slugify(input.category), input.category);
      const values = {
        slug: input.slug || slugify(input.title),
        title: input.title,
        summary: input.summary,
        bodyMd: input.bodyMd,
        categoryId,
        coverUrl: input.coverUrl,
        status: input.status,
        publishedAt: publishDate(input, existing?.publishedAt ?? null),
      };
      const guideId = id ?? (await repo.insertGuide(tx, values));
      if (id) await repo.updateGuide(tx, id, values);
      await repo.replaceGuideProducts(tx, guideId, [...new Set(input.productIds)]);
      return guideId;
    }),
  );
}

export async function createGuide(input: GuideInput): Promise<AdminGuide> {
  return getGuide(await saveGuide(null, input));
}

export async function updateGuide(id: string, input: GuideInput): Promise<AdminGuide> {
  await saveGuide(id, input);
  return getGuide(id);
}

export async function deleteGuide(id: string): Promise<void> {
  if (!(await repo.deleteGuide(id))) throw notFound('Guide not found');
}

// ---------- help articles ----------

const toHelp = (r: NonNullable<Awaited<ReturnType<typeof repo.insertHelp>>>): AdminHelpArticle => ({
  ...r,
  updatedAt: r.updatedAt.toISOString(),
});

export async function listHelp(): Promise<AdminHelpArticle[]> {
  return (await repo.listHelp()).map(toHelp);
}

const helpValues = (input: HelpInput) => ({
  slug: input.slug || slugify(input.question),
  topic: input.topic,
  question: input.question,
  answerMd: input.answerMd,
  status: input.status,
  sortOrder: input.sortOrder,
});

export async function createHelp(input: HelpInput): Promise<AdminHelpArticle> {
  const row = await mapSlugConflict(() => repo.insertHelp(helpValues(input)));
  if (!row) throw new Error('help insert returned no row');
  return toHelp(row);
}

export async function updateHelp(id: string, input: HelpInput): Promise<AdminHelpArticle> {
  const row = await mapSlugConflict(() => repo.updateHelp(id, helpValues(input)));
  if (!row) throw notFound('Help article not found');
  return toHelp(row);
}

export async function deleteHelp(id: string): Promise<void> {
  if (!(await repo.deleteHelp(id))) throw notFound('Help article not found');
}

// ---------- testimonials ----------

const toTestimonial = (r: AdminTestimonial): AdminTestimonial => ({
  id: r.id,
  name: r.name,
  area: r.area,
  rating: r.rating,
  quote: r.quote,
  isFeatured: r.isFeatured,
});

export async function listTestimonials(): Promise<AdminTestimonial[]> {
  return (await repo.listTestimonials()).map(toTestimonial);
}

export async function createTestimonial(input: TestimonialInput): Promise<AdminTestimonial> {
  const row = await repo.insertTestimonial(input);
  if (!row) throw new Error('testimonial insert returned no row');
  return toTestimonial(row);
}

export async function updateTestimonial(
  id: string,
  input: TestimonialInput,
): Promise<AdminTestimonial> {
  const row = await repo.updateTestimonial(id, input);
  if (!row) throw notFound('Testimonial not found');
  return toTestimonial(row);
}

export async function deleteTestimonial(id: string): Promise<void> {
  if (!(await repo.deleteTestimonial(id))) throw notFound('Testimonial not found');
}

// ---------- withdrawals ----------

const toWithdrawal = (
  r: Awaited<ReturnType<typeof repo.listWithdrawals>>[number],
): AdminWithdrawal => ({
  id: r.id,
  reference: referenceOf(r.id),
  orderNumber: r.orderNumber,
  email: r.email,
  itemsText: r.itemsText,
  reason: r.reason,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
});

export async function listWithdrawals(): Promise<AdminWithdrawal[]> {
  return (await repo.listWithdrawals()).map(toWithdrawal);
}

export async function setWithdrawalStatus(
  id: string,
  status: WithdrawalStatus,
): Promise<AdminWithdrawal> {
  const row = await repo.updateWithdrawalStatus(id, status);
  if (!row) throw notFound('Withdrawal request not found');
  return toWithdrawal(row);
}

// ---------- contact messages ----------

const toMessage = (
  r: Awaited<ReturnType<typeof repo.listContactMessages>>[number],
): AdminContactMessage => ({
  id: r.id,
  reference: contactReference(r.id),
  name: r.name,
  email: r.email,
  topic: r.topic as AdminContactMessage['topic'],
  orderNumber: r.orderNumber,
  message: r.message,
  createdAt: r.createdAt.toISOString(),
  handledAt: r.handledAt?.toISOString() ?? null,
});

export async function listContactMessages(): Promise<AdminContactMessage[]> {
  return (await repo.listContactMessages()).map(toMessage);
}

export async function setContactHandled(
  id: string,
  handled: boolean,
): Promise<AdminContactMessage> {
  const row = await repo.setContactHandled(id, handled);
  if (!row) throw notFound('Message not found');
  return toMessage(row);
}

// ---------- homepage blocks ----------

export const getHome = (): Promise<AdminHomeContent> => getHomeContent();

export async function putHome(key: HomeContentKey, value: unknown): Promise<AdminHomeContent> {
  // The value's shape depends on the key, so it is validated here (not by the route schema).
  const schema = key === 'hero_slides' ? HeroSlidesSchema : PromoTileSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validation({ formErrors: parsed.error.issues.map((i) => i.message), fieldErrors: {} });
  }
  await putHomeContent(key, parsed.data);
  return AdminHomeContentSchema.parse(await getHomeContent());
}
