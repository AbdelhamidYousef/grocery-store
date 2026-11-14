import { existsSync } from 'node:fs';
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { reviewPhotos } from '../../db/schema/index.ts';
import { ORPHAN_AFTER_MS, sweepOrphanUploads } from '../../lib/upload-refs.ts';
import { makeTestApp, TEST_UPLOAD_DIR } from '../../test/app.ts';
import { createProduct, createReview } from '../../test/factories.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();
const cfg = { dir: TEST_UPLOAD_DIR, enabled: true };

afterAll(async () => {
  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

let n = 0;
// A file "we wrote": same folder and name shape as savePhoto, so removePhotos treats it as ours.
async function makeFile(folder: 'reviews', ageMs = 0) {
  const name = `00000000-0000-4000-8000-${String(++n + Date.now())
    .padStart(12, '0')
    .slice(-12)}.webp`;
  await mkdir(join(TEST_UPLOAD_DIR, folder), { recursive: true });
  const file = join(TEST_UPLOAD_DIR, folder, name);
  await writeFile(file, 'x');
  if (ageMs > 0) {
    const t = new Date(Date.now() - ageMs);
    await utimes(file, t, t);
  }
  return { file, url: `/api/v1/uploads/${folder}/${name}` };
}

describe('uploaded files shared between rows', () => {
  it('keeps the file while another review photo row still uses it', async () => {
    const { product } = await createProduct();
    const a = await createReview(product.id);
    const b = await createReview(product.id);
    const f = await makeFile('reviews');
    await db.insert(reviewPhotos).values([
      { reviewId: a.id, path: f.url },
      { reviewId: b.id, path: f.url },
    ]);
    const { shopper } = await signedIn(app, 'admin');
    expect((await shopper.call('delete', `/admin/reviews/${a.id}`)).status).toBe(204);
    expect(existsSync(f.file)).toBe(true);
    // Once the last review goes too, nothing references the file and it is removed.
    expect((await shopper.call('delete', `/admin/reviews/${b.id}`)).status).toBe(204);
    expect(existsSync(f.file)).toBe(false);
  });
});

describe('rejecting a review', () => {
  it('removes its photo files and rows, unless another review shares a file', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending' });
    const own = await makeFile('reviews');
    const shared = await makeFile('reviews');
    const other = await createReview(product.id);
    await db.insert(reviewPhotos).values([
      { reviewId: r.id, path: own.url, position: 0 },
      { reviewId: r.id, path: shared.url, position: 1 },
      { reviewId: other.id, path: shared.url, position: 0 },
    ]);
    const { shopper } = await signedIn(app, 'admin');
    const res = await shopper.call('post', `/admin/reviews/${r.id}/reject`, { reason: 'Spam' });
    expect(res.status).toBe(200);
    expect(existsSync(own.file)).toBe(false);
    expect(existsSync(shared.file)).toBe(true);
    expect(await db.select().from(reviewPhotos)).toHaveLength(1);
  });
});

describe('sweepOrphanUploads', () => {
  it('removes unreferenced files older than 24 h and nothing else', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const day = ORPHAN_AFTER_MS + 60_000;
    const oldOrphan = await makeFile('reviews', day);
    const freshOrphan = await makeFile('reviews', 60_000);
    const oldUsedByReview = await makeFile('reviews', day);
    await db.insert(reviewPhotos).values({ reviewId: r.id, path: oldUsedByReview.url });

    expect(await sweepOrphanUploads(cfg)).toBe(1);
    expect(existsSync(oldOrphan.file)).toBe(false);
    expect(existsSync(freshOrphan.file)).toBe(true);
    expect(existsSync(oldUsedByReview.file)).toBe(true);
    expect(await sweepOrphanUploads(cfg)).toBe(0);
  });

  it('does nothing when the upload folders do not exist', async () => {
    expect(await sweepOrphanUploads({ dir: join(TEST_UPLOAD_DIR, 'missing'), enabled: true })).toBe(
      0,
    );
  });
});
