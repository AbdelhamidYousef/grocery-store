import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';

export const userRole = pgEnum('user_role', ['customer', 'admin']);

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: userRole('role').notNull().default('customer'),
  // Nullable from day one so email verification (a stretch feature) needs no migration later.
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
