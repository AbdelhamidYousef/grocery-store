import { sql } from 'drizzle-orm';
import { boolean, char, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { users } from './users.ts';

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label'),
    fullName: text('full_name').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    region: text('region'),
    postalCode: text('postal_code').notNull(),
    // ISO 3166-1 alpha-2, e.g. "DE".
    country: char('country', { length: 2 }).notNull(),
    phone: text('phone'),
    isDefaultShipping: boolean('is_default_shipping').notNull().default(false),
    isDefaultBilling: boolean('is_default_billing').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('addresses_user_id_idx').on(t.userId),
    // Partial: only rows flagged default take part, so a user can own any number of non-default
    // addresses but at most one default shipping and one default billing address.
    uniqueIndex('addresses_one_default_shipping_idx')
      .on(t.userId)
      .where(sql`${t.isDefaultShipping}`),
    uniqueIndex('addresses_one_default_billing_idx')
      .on(t.userId)
      .where(sql`${t.isDefaultBilling}`),
  ],
);
