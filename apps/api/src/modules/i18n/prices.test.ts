import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { productVariants, variantPrices } from '../../db/schema/index.ts';
import { createProduct } from '../../test/factories.ts';

describe('variant prices', () => {
  it('mirrors the base price into a EUR row, on insert and on update', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1999 }] });
    const id = variants[0]!.id;
    const eur = () => db.select().from(variantPrices).where(eq(variantPrices.variantId, id));
    expect(await eur()).toMatchObject([{ currency: 'EUR', priceCents: 1999 }]);
    await db.update(productVariants).set({ priceCents: 2499 }).where(eq(productVariants.id, id));
    expect(await eur()).toMatchObject([{ currency: 'EUR', priceCents: 2499 }]);
  });
});
