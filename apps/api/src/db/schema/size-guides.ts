import type { SizeGuideTable } from '@store/shared';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// One guide serves many products (all harnesses share one chart). `rows` is
// { columns: string[], rows: { size, label, values: string[] }[] }, validated by Zod at the edge;
// `size` is the option value a variant carries, which is how the modal highlights its row.
export const sizeGuides = pgTable('size_guides', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  rows: jsonb('rows').$type<SizeGuideTable>().notNull(),
  howtoMd: text('howto_md').notNull().default(''),
  tip: text('tip'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
