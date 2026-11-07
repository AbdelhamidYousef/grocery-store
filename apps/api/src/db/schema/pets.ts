import { PET_VALUES } from '@store/shared';
import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { users } from './users.ts';

// Same values as the shared PET_VALUES constant (the one source of truth for which pets exist), so
// a pet profile can never name a species the catalogue has no products for.
export const petSpecies = pgEnum('pet_species', PET_VALUES);
export const petSize = pgEnum('pet_size', ['xs', 's', 'm', 'l', 'xl']);

export const pets = pgTable(
  'pets',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    species: petSpecies('species').notNull(),
    // A plain calendar date, no time zone: "born on 18 March" is the same everywhere, and phase 19
    // reads this column for birthday emails (the name is final).
    birthday: date('birthday', { mode: 'string' }),
    approxAgeMonths: integer('approx_age_months'),
    size: petSize('size'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('pets_user_id_idx').on(t.userId),
    check('pets_approx_age_check', sql`${t.approxAgeMonths} is null or ${t.approxAgeMonths} >= 0`),
  ],
);
