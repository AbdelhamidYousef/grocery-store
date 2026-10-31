import { db } from '../db/client.ts';
import {
  cartItems,
  carts,
  categories,
  inventory,
  productVariants,
  products,
  users,
} from '../db/schema/index.ts';

// Unique suffix per call so factories can be used many times inside one test without colliding
// on slug / SKU / email unique constraints.
let counter = 0;
const next = () => ++counter;

function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`factory: insert of ${what} returned no row`);
  return row;
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const n = next();
  return first(
    await db
      .insert(users)
      .values({
        email: `user${n}@pawsome.test`,
        // Not a real hash: hashing with argon2 would slow every test; login tests hash on their own.
        passwordHash: 'test-hash',
        firstName: 'Test',
        lastName: `User${n}`,
        ...overrides,
      })
      .returning(),
    'user',
  );
}

export type VariantInput = {
  name?: string;
  options?: Record<string, string>;
  priceCents?: number;
  weightGrams?: number;
  /** Units in stock; defaults to 50. */
  stock?: number;
};

export async function createProduct(
  input: {
    name?: string;
    description?: string;
    status?: 'draft' | 'active' | 'archived';
    variants?: VariantInput[];
  } = {},
) {
  const n = next();
  const [category] = await db
    .insert(categories)
    .values({ slug: `test-category-${n}`, name: `Test category ${n}` })
    .returning();
  if (!category) throw new Error('factory: insert of category returned no row');

  const product = first(
    await db
      .insert(products)
      .values({
        slug: `test-product-${n}`,
        name: input.name ?? `Test product ${n}`,
        description: input.description ?? 'A product made by a test factory.',
        categoryId: category.id,
        status: input.status ?? 'active',
      })
      .returning(),
    'product',
  );

  const variantInputs = input.variants ?? [{}];
  const variants = await db
    .insert(productVariants)
    .values(
      variantInputs.map((v, i) => ({
        productId: product.id,
        sku: `PW-TEST-${n}-${i + 1}`,
        name: v.name ?? `Variant ${i + 1}`,
        // Options must differ per variant (unique per product), hence the index.
        options: v.options ?? { variant: String(i + 1) },
        priceCents: v.priceCents ?? 1000,
        weightGrams: v.weightGrams ?? 200,
        isDefault: i === 0,
      })),
    )
    .returning();

  await db.insert(inventory).values(
    variants.map((variant, i) => ({
      variantId: variant.id,
      quantity: variantInputs[i]?.stock ?? 50,
    })),
  );

  return { product, category, variants };
}

export async function createCart(
  input: {
    userId?: string | null;
    status?: 'active' | 'merged' | 'converted' | 'abandoned';
    items?: { variantId: string; quantity: number }[];
  } = {},
) {
  const cart = first(
    await db
      .insert(carts)
      .values({
        userId: input.userId ?? null,
        status: input.status ?? 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      })
      .returning(),
    'cart',
  );
  const items = input.items?.length
    ? await db
        .insert(cartItems)
        .values(input.items.map((item) => ({ cartId: cart.id, ...item })))
        .returning()
    : [];
  return { cart, items };
}
