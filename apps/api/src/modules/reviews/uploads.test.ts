import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { reviewPhotos, reviews } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN, TEST_UPLOAD_DIR } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();

afterAll(async () => {
  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

const fields = {
  rating: '5',
  title: 'Brilliant bed',
  body: 'My dog sleeps in it every single night and it still looks new.',
  wouldRecommend: 'true',
};

const jpeg = (opts: { width?: number; exif?: boolean } = {}) => {
  let img = sharp({
    create: {
      width: opts.width ?? 64,
      height: 48,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  }).jpeg();
  if (opts.exif) img = img.withExif({ IFD0: { Copyright: 'secret-gps-owner' } });
  return img.toBuffer();
};

async function post(
  app2: ReturnType<typeof makeTestApp>,
  who: Awaited<ReturnType<typeof signedIn>>,
  slug: string,
  photos: { buf: Buffer; name?: string; type?: string }[],
) {
  const req = request(app2)
    .post(`/api/v1/products/${slug}/reviews`)
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', `sid=${who.shopper.jar.get('sid')}`);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  for (const p of photos) {
    req.attach('photos', p.buf, {
      filename: p.name ?? 'p.jpg',
      contentType: p.type ?? 'image/jpeg',
    });
  }
  return req;
}

describe('review photo upload', () => {
  it('stores a re-encoded WebP under a random name and serves it', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const res = await post(app, who, product.slug, [{ buf: await jpeg(), name: '../../evil.jpg' }]);
    expect(res.status).toBe(201);
    const [photo] = await db.select().from(reviewPhotos);
    expect(photo?.path).toMatch(/^\/api\/v1\/uploads\/reviews\/[0-9a-f-]{36}\.webp$/);
    expect(photo?.path).not.toContain('evil');
    const served = await request(app).get(photo!.path);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect((await sharp(served.body as Buffer).metadata()).format).toBe('webp');
  });

  it('strips EXIF metadata', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const source = await jpeg({ exif: true });
    expect((await sharp(source).metadata()).exif).toBeDefined();
    await post(app, who, product.slug, [{ buf: source }]);
    const [photo] = await db.select().from(reviewPhotos);
    const file = await readFile(join(TEST_UPLOAD_DIR, 'reviews', photo!.path.split('/').pop()!));
    expect((await sharp(file).metadata()).exif).toBeUndefined();
    expect(file.includes(Buffer.from('secret-gps-owner'))).toBe(false);
  });

  it('shrinks a large picture to at most 1200 px on the long edge', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    await post(app, who, product.slug, [{ buf: await jpeg({ width: 2400 }) }]);
    const [photo] = await db.select().from(reviewPhotos);
    const file = await readFile(join(TEST_UPLOAD_DIR, 'reviews', photo!.path.split('/').pop()!));
    expect((await sharp(file).metadata()).width).toBe(1200);
  });

  it('rejects a file that is not an image even when it claims image/jpeg', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const res = await post(app, who, product.slug, [
      { buf: Buffer.from('<script>alert(1)</script>'), name: 'x.jpg', type: 'image/jpeg' },
    ]);
    expect(res.status).toBe(400);
    expect(errorOf(res).message).toMatch(/JPEG, PNG or WebP/);
    expect(await db.select().from(reviews)).toHaveLength(0);
  });

  it('rejects a GIF (not on the allow list)', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary');
    expect((await post(app, who, product.slug, [{ buf: gif, type: 'image/gif' }])).status).toBe(
      400,
    );
  });

  it('accepts three photos and rejects a fourth', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const three = [await jpeg(), await jpeg(), await jpeg()].map((buf) => ({ buf }));
    const ok = await post(app, who, product.slug, three);
    expect(ok.status).toBe(201);
    expect(await db.select().from(reviewPhotos)).toHaveLength(3);

    const other = await createProduct();
    const four = [...three, { buf: await jpeg() }];
    const res = await post(app, who, other.product.slug, four);
    expect(res.status).toBe(400);
    expect(errorOf(res).message).toMatch(/up to 3 photos/);
  });

  it('answers 413 for a photo over 3 MB', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(3 * 1024 * 1024 + 10),
    ]);
    const res = await post(app, who, product.slug, [{ buf: big }]);
    expect(res.status).toBe(413);
    expect(await db.select().from(reviews)).toHaveLength(0);
  });

  it('leaves no file behind when the review is a duplicate', async () => {
    const { product } = await createProduct();
    const who = await signedIn(app);
    await post(app, who, product.slug, []);
    const before = await readdir(join(TEST_UPLOAD_DIR, 'reviews')).catch(() => []);
    const dup = await post(app, who, product.slug, [{ buf: await jpeg() }]);
    expect(dup.status).toBe(409);
    const after = await readdir(join(TEST_UPLOAD_DIR, 'reviews')).catch(() => []);
    expect(after).toEqual(before);
  });

  it('refuses photos when uploads are switched off but still takes a text review', async () => {
    const off = makeTestApp({ config: { uploads: { dir: TEST_UPLOAD_DIR, enabled: false } } });
    const { product } = await createProduct();
    const who = await signedIn(off);
    const withPhoto = await post(off, who, product.slug, [{ buf: await jpeg() }]);
    expect(withPhoto.status).toBe(400);
    expect(errorOf(withPhoto).message).toMatch(/switched off/);
    const plain = await post(off, who, product.slug, []);
    expect(plain.status).toBe(201);
    expect(bodyOf<{ data: { id: string } }>(plain).data.id).toBeTruthy();
    expect(await db.select().from(reviews).where(eq(reviews.status, 'pending'))).toHaveLength(1);
  });

  it('does not serve dotfiles or listings from the uploads folder', async () => {
    expect((await request(app).get('/api/v1/uploads/reviews/')).status).toBe(404);
    expect((await request(app).get('/api/v1/uploads/../package.json')).status).toBe(404);
  });
});
