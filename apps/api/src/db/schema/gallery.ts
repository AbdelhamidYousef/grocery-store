import { boolean, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { products } from './products.ts';

// The shoppable #RealPawsomePets gallery: customer photos, each linked to the products in them.
export const galleryPhotos = pgTable(
  'gallery_photos',
  {
    id: id(),
    path: text('path').notNull(),
    caption: text('caption').notNull().default(''),
    petName: text('pet_name').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    published: boolean('published').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('gallery_photos_published_sort_idx').on(t.published, t.sortOrder)],
);

export const galleryPhotoProducts = pgTable(
  'gallery_photo_products',
  {
    photoId: uuid('photo_id')
      .notNull()
      .references(() => galleryPhotos.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.photoId, t.productId] }),
    index('gallery_photo_products_product_idx').on(t.productId),
  ],
);
