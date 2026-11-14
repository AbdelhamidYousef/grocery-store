import { Writable } from 'node:stream';

import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeTestApp } from '../../../test/app.ts';
import { createProduct } from '../../../test/factories.ts';
import { bodyOf, errorOf } from '../../../test/http.ts';
import { signedIn } from '../../../test/orders.ts';
import type { Shopper } from '../../../test/shopper.ts';
import { makeShopper } from '../../../test/shopper.ts';

const lines: Record<string, unknown>[] = [];
const logger = pino(
  { level: 'info' },
  new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      cb();
    },
  }),
);
const app = makeTestApp({ logger });
let admin: Shopper;

beforeEach(async () => {
  lines.length = 0;
  admin = (await signedIn(app, 'admin', 'boss@pawsome.test')).shopper;
});

const data = <T>(res: Parameters<typeof bodyOf>[0]) => bodyOf<{ data: T }>(res).data;
const audits = () => lines.filter((l) => l.audit === true);

type Content = {
  specs: { label: string; value: string }[];
  faqs: { id: string; question: string }[];
  constituents: { variantId: string; values: { key: string; valueBp: number }[] }[];
  deliveryNote: string | null;
};

describe('admin product content', () => {
  it('is for admins only', async () => {
    const { product } = await createProduct();
    const guest = makeShopper(app);
    expect((await guest.call('get', `/admin/products/${product.id}/content`)).status).toBe(401);
    const customer = (await signedIn(app, 'customer', 'sam@pawsome.test')).shopper;
    expect((await customer.call('put', `/admin/products/${product.id}/content`, {})).status).toBe(
      403,
    );
  });

  it('answers an empty page with one constituents entry per variant', async () => {
    const { product, variants } = await createProduct({ variants: [{}, {}] });
    const res = await admin.call('get', `/admin/products/${product.id}/content`);
    expect(res.status).toBe(200);
    const content = data<Content>(res);
    expect(content).toMatchObject({ specs: [], faqs: [], deliveryNote: null });
    expect(content.constituents.map((c) => c.variantId).sort()).toEqual(
      variants.map((v) => v.id).sort(),
    );
  });

  it('saves every section in one request and reads it back in order', async () => {
    const { product, variants } = await createProduct();
    const res = await admin.call('put', `/admin/products/${product.id}/content`, {
      specs: [
        { label: 'Origin', value: 'Nowhere' },
        { label: 'Grain', value: 'Free' },
      ],
      faqs: [
        { question: 'One?', answer: 'Yes.' },
        { question: 'Two?', answer: 'No.' },
      ],
      constituents: [
        {
          variantId: variants[0]!.id,
          values: [
            { key: 'protein', valueBp: 2650 },
            { key: 'kcal', valueBp: 365 },
          ],
        },
      ],
      deliveryNote: 'Ships alone.',
    });
    expect(res.status).toBe(200);
    const content = data<Content>(res);
    expect(content.specs.map((s) => s.label)).toEqual(['Origin', 'Grain']);
    expect(content.faqs.map((f) => f.question)).toEqual(['One?', 'Two?']);
    expect(content.constituents[0]?.values).toEqual([
      { key: 'protein', valueBp: 2650 },
      { key: 'kcal', valueBp: 365 },
    ]);
    expect(content.deliveryNote).toBe('Ships alone.');
    expect(audits().at(-1)).toMatchObject({ action: 'product.content.update', target: product.id });
  });

  it('leaves sections the request does not carry alone, and replaces the ones it does', async () => {
    const { product } = await createProduct();
    const path = `/admin/products/${product.id}/content`;
    await admin.call('put', path, {
      specs: [{ label: 'A', value: '1' }],
      faqs: [{ question: 'Q?', answer: 'A.' }],
    });
    const res = await admin.call('put', path, { specs: [{ label: 'B', value: '2' }] });
    const content = data<Content>(res);
    expect(content.specs).toEqual([{ label: 'B', value: '2' }]);
    expect(content.faqs).toHaveLength(1);
    // An empty list is a real answer: it clears the section.
    const cleared = data<Content>(await admin.call('put', path, { faqs: [] }));
    expect(cleared.faqs).toEqual([]);
    expect(cleared.specs).toHaveLength(1);
  });

  it('refuses duplicate spec labels and a percentage above 100 %', async () => {
    const { product, variants } = await createProduct();
    const path = `/admin/products/${product.id}/content`;
    const dup = await admin.call('put', path, {
      specs: [
        { label: 'Origin', value: 'a' },
        { label: 'origin', value: 'b' },
      ],
    });
    expect(dup.status).toBe(400);
    const big = await admin.call('put', path, {
      constituents: [{ variantId: variants[0]!.id, values: [{ key: 'fat', valueBp: 10001 }] }],
    });
    expect(big.status).toBe(400);
    const twice = await admin.call('put', path, {
      constituents: [
        {
          variantId: variants[0]!.id,
          values: [
            { key: 'fat', valueBp: 100 },
            { key: 'fat', valueBp: 200 },
          ],
        },
      ],
    });
    expect(twice.status).toBe(400);
  });

  it("refuses constituents for another product's variant", async () => {
    const { product } = await createProduct();
    const other = await createProduct();
    const path = `/admin/products/${product.id}/content`;
    const foreign = await admin.call('put', path, {
      constituents: [{ variantId: other.variants[0]!.id, values: [{ key: 'fat', valueBp: 100 }] }],
    });
    expect(foreign.status).toBe(400);
    expect(JSON.stringify(errorOf(foreign).details)).toContain('constituents');
  });

  it('404s for an unknown product', async () => {
    const res = await admin.call(
      'get',
      '/admin/products/00000000-0000-4000-8000-000000000000/content',
    );
    expect(res.status).toBe(404);
  });

  it('rolls back every section when one of them fails', async () => {
    const { product } = await createProduct();
    const other = await createProduct();
    const path = `/admin/products/${product.id}/content`;
    await admin.call('put', path, { specs: [{ label: 'Keep', value: 'me' }] });
    const res = await admin.call('put', path, {
      specs: [{ label: 'Lost', value: 'x' }],
      constituents: [{ variantId: other.variants[0]!.id, values: [{ key: 'fat', valueBp: 100 }] }],
    });
    expect(res.status).toBe(400);
    expect(data<Content>(await admin.call('get', path)).specs).toEqual([
      { label: 'Keep', value: 'me' },
    ]);
  });
});
