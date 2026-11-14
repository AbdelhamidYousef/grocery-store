import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { db } from '../db/client.ts';
import { galleryPhotos, reviewPhotos } from '../db/schema/index.ts';

import { removePhotos, UPLOAD_URL_PREFIX, type UploadConfig } from './uploads.ts';

// One uploaded file can be referenced by more than one row: the admin gallery form lets an admin
// type an existing path, so a gallery entry can point at a review's photo (or at another entry's).
// Deleting a row therefore must not unlink a file another row still shows.
async function referencedPaths(): Promise<Set<string>> {
  const [g, r] = await Promise.all([
    db.select({ path: galleryPhotos.path }).from(galleryPhotos),
    db.select({ path: reviewPhotos.path }).from(reviewPhotos),
  ]);
  return new Set([...g, ...r].map((x) => x.path));
}

/** Remove the files among `urls` that no gallery or review photo row references any more. Call AFTER the row is gone. */
export async function removeUnreferencedPhotos(cfg: UploadConfig, urls: string[]): Promise<void> {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return;
  const used = await referencedPaths();
  await removePhotos(
    cfg,
    unique.filter((u) => !used.has(u)),
  );
}

export const ORPHAN_AFTER_MS = 24 * 60 * 60_000;

/**
 * Cleanup for uploads that never got attached (an admin uploaded a gallery photo and closed the
 * tab, a review post failed after the files were saved): files under `<dir>/reviews` and
 * `<dir>/gallery` older than 24 h that no row references. Returns how many were removed.
 * Scheduled daily by the job runner (`sweep-orphan-uploads`); it is safe to call any time.
 */
export async function sweepOrphanUploads(cfg: UploadConfig, now = Date.now()): Promise<number> {
  const used = await referencedPaths();
  let removed = 0;
  for (const folder of ['reviews', 'gallery'] as const) {
    const dir = join(cfg.dir, folder);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (!/^[\w-]+\.webp$/.test(name)) continue;
      if (used.has(`${UPLOAD_URL_PREFIX}/${folder}/${name}`)) continue;
      const file = join(dir, name);
      const info = await stat(file).catch(() => undefined);
      if (!info || now - info.mtimeMs < ORPHAN_AFTER_MS) continue;
      if (
        await unlink(file).then(
          () => true,
          () => false,
        )
      )
        removed += 1;
    }
  }
  return removed;
}
