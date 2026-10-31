import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// A few editable homepage blocks (hero slides, the promo tile) as one JSON document per key. A
// table per block would be heavy for three tiny, rarely-queried structures; the shape of each
// document is validated with Zod in the API (@store/shared), not by the database.
export const homeContent = pgTable('home_content', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
