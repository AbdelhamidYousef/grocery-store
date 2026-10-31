import type { HelpTopic } from '@store/shared';
import { sql } from 'drizzle-orm';
import { customType, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { contentStatus } from './guides.ts';

// Postgres full-text document: a sorted list of lemmatised words with positions. Never read by the
// app (the query side uses it through `@@` and `ts_rank`), so the TypeScript type is just `string`.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const helpArticles = pgTable(
  'help_articles',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    topic: text('topic').$type<HelpTopic>().notNull(),
    question: text('question').notNull(),
    answerMd: text('answer_md').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: contentStatus('status').notNull().default('published'),
    // GENERATED ... STORED: the database rebuilds it on every insert or update, so the admin
    // editing an answer can never leave the search index stale, and no code has to remember to.
    // The question weighs more (A) than the answer (B), so a title match ranks first.
    // The regconfig is a literal ('english'), which is what keeps the expression immutable (a
    // requirement for generated columns).
    search: tsvector('search')
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('english', question), 'A') || setweight(to_tsvector('english', answer_md), 'B')`,
      ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('help_articles_search_idx').using('gin', t.search),
    index('help_articles_topic_idx').on(t.topic, t.sortOrder),
  ],
);
