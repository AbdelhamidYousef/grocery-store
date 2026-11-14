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
async function makeFile(folder: 'reviews' | 'gallery', ageMs = 0) {
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
  it('keeps the file when deleting a gallery entry that a review photo still uses', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const f = await makeFile('reviews');
    await db.insert(reviewPhotos).values({ reviewId: r.id, path: f.url });
    const { shopper } = await signedIn(app, 'admin');
    const created = await shopper.call('post', '/admin/gallery', { path: f.url });
    const id = (created.body as { data: { id: string } }).data.id;
    expect((await shopper.call('delete', `/admin/gallery/${id}`)).status).toBe(204);
    expect(existsSync(f.file)).toBe(true);
    // Once the review goes too, nothing references the file and it is removed.
    expect((await shopper.call('delete', `/admin/reviews/${r.id}`)).status).toBe(204);
    expect(existsSync(f.file)).toBe(false);
  });

  it('keeps the file when deleting a review that a gallery entry still uses', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const f = await makeFile('reviews');
    await db.insert(reviewPhotos).values({ reviewId: r.id, path: f.url });
    const { shopper } = await signedIn(app, 'admin');
    const created = await shopper.call('post', '/admin/gallery', { path: f.url });
    const id = (created.body as { data: { id: string } }).data.id;
    await shopper.call('delete', `/admin/reviews/${r.id}`);
    expect(existsSync(f.file)).toBe(true);
    await shopper.call('delete', `/admin/gallery/${id}`);
    expect(existsSync(f.file)).toBe(false);
  });

  it('removes the old uploaded file when a gallery entry changes its path', async () => {
    const oldF = await makeFile('gallery');
    const newF = await makeFile('gallery');
    const { shopper } = await signedIn(app, 'admin');
    const created = await shopper.call('post', '/admin/gallery', { path: oldF.url });
    const id = (created.body as { data: { id: string } }).data.id;
    // A caption-only edit leaves the file alone.
    await shopper.call('patch', `/admin/gallery/${id}`, { caption: 'x' });
    expect(existsSync(oldF.file)).toBe(true);
    const res = await shopper.call('patch', `/admin/gallery/${id}`, { path: newF.url });
    expect(res.status).toBe(200);
    expect(existsSync(oldF.file)).toBe(false);
    expect(existsSync(newF.file)).toBe(true);
  });
});

describe('rejecting a review', () => {
  it('removes its photo files and rows, unless a gallery entry shares a file', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending' });
    const own = await makeFile('reviews');
    const shared = await makeFile('reviews');
    await db.insert(reviewPhotos).values([
      { reviewId: r.id, path: own.url, position: 0 },
      { reviewId: r.id, path: shared.url, position: 1 },
    ]);
    const { shopper } = await signedIn(app, 'admin');
    await shopper.call('post', '/admin/gallery', { path: shared.url });
    const res = await shopper.call('post', `/admin/reviews/${r.id}/reject`, { reason: 'Spam' });
    expect(res.status).toBe(200);
    expect(existsSync(own.file)).toBe(false);
    expect(existsSync(shared.file)).toBe(true);
    expect(await db.select().from(reviewPhotos)).toHaveLength(0);
  });
});

describe('sweepOrphanUploads', () => {
  it('removes unreferenced files older than 24 h and nothing else', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const day = ORPHAN_AFTER_MS + 60_000;
    const oldOrphan = await makeFile('gallery', day);
    const oldOrphanReview = await makeFile('reviews', day);
    const freshOrphan = await makeFile('gallery', 60_000);
    const oldUsedByReview = await makeFile('reviews', day);
    const oldUsedByGallery = await makeFile('gallery', day);
    await db.insert(reviewPhotos).values({ reviewId: r.id, path: oldUsedByReview.url });
    const { shopper } = await signedIn(app, 'admin');
    await shopper.call('post', '/admin/gallery', { path: oldUsedByGallery.url });

    expect(await sweepOrphanUploads(cfg)).toBe(2);
    expect(existsSync(oldOrphan.file)).toBe(false);
    expect(existsSync(oldOrphanReview.file)).toBe(false);
    expect(existsSync(freshOrphan.file)).toBe(true);
    expect(existsSync(oldUsedByReview.file)).toBe(true);
    expect(existsSync(oldUsedByGallery.file)).toBe(true);
    expect(await sweepOrphanUploads(cfg)).toBe(0);
  });

  it('does nothing when the upload folders do not exist', async () => {
    expect(await sweepOrphanUploads({ dir: join(TEST_UPLOAD_DIR, 'missing'), enabled: true })).toBe(
      0,
    );
  });
});
