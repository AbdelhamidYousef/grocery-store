import { sql } from 'drizzle-orm';
import { index, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// A real table (not a jsonb string) so a brand can have its own page, story and accent colour,
// be edited in the admin, and be counted as a facet with one GROUP BY.
export const brands = pgTable(
  'brands',
  {
    id: id(),
    // Immutable once public: /brands/:slug depends on it.
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    story: text('story').notNull().default(''),
    // CSS colour (#RRGGBB) the brand page is themed with.
    accentColor: text('accent_color').notNull().default('#F59E0B'),
    logoUrl: text('logo_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('brands_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`)],
);
