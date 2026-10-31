import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { createdAt } from './columns.ts';
import { users } from './users.ts';

export const sessions = pgTable(
  'sessions',
  {
    // The cookie value itself (32 random bytes, base64url), so it must not be guessable like a uuid.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);
