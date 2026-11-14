import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { pets } from './pets.ts';

// One row per mail a pet has been sent: the unique key IS the "once" guarantee. A birthday uses the
// year as `period_key` (once per pet per year); a life-stage mail uses 'once' (once per milestone).
export const petMessages = pgTable(
  'pet_messages',
  {
    id: id(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    periodKey: text('period_key').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [unique('pet_messages_pet_kind_period_unique').on(t.petId, t.kind, t.periodKey)],
);
