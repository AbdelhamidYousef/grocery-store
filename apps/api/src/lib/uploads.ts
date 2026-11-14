import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ErrorCode, MAX_REVIEW_PHOTO_BYTES, MAX_REVIEW_PHOTOS } from '@store/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { AppError, validation } from './errors.ts';

// HONEST LIMITATION (phase 17 decision): there is no object storage in the stack, so uploads go to
// a folder on the API's own disk. Render's free tier has an EPHEMERAL disk: files vanish on every
// redeploy or restart. The public demo therefore ships its review photos as committed static
// files and sets UPLOADS_ENABLED=false, which turns live upload off. Real production would use
// Cloudflare R2 or Supabase Storage (both have free tiers) behind the same `savePhoto` function;
// none is adopted without the owner's OK.

export interface UploadConfig {
  /** Where files are written (`<dir>/reviews/<uuid>.webp`). */
  dir: string;
  /** False: any photo in a request is refused with a clear message. */
  enabled: boolean;
}

/** URL prefix the files are served under (inside /api/v1 so dev proxy and prod rewrites cover it). */
export const UPLOAD_URL_PREFIX = '/api/v1/uploads';

const MAX_EDGE_PX = 1200;
// A 3 MB JPEG can decode to a huge bitmap (a "decompression bomb"); refuse above ~40 megapixels.
const MAX_INPUT_PIXELS = 40_000_000;

// The client's filename and Content-Type are attacker-controlled, so neither is trusted: the type
// is read from the first bytes of the file itself ("magic bytes").
export function sniffImage(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

// Re-encoding is the security step: the stored file is one WE produced, so a polyglot or
// malformed file cannot survive, and sharp drops all metadata unless asked to keep it (a phone
// photo carries GPS coordinates in EXIF: we never publish those). `rotate()` first applies the
// EXIF orientation so the picture is still upright after the tag is gone.
export async function reencode(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw validation(undefined, 'That file could not be read as an image.');
  }
}

// Random name: nothing from the client reaches the file system, so no path tricks and no
// overwriting somebody else's photo.
export async function savePhoto(
  cfg: UploadConfig,
  input: Buffer,
  folder: 'reviews' = 'reviews',
): Promise<string> {
  if (!cfg.enabled) throw validation(undefined, 'Photo upload is switched off in this demo.');
  if (!sniffImage(input)) {
    throw validation(undefined, 'Photos must be JPEG, PNG or WebP images.');
  }
  const out = await reencode(input);
  const name = `${randomUUID()}.webp`;
  const target = join(cfg.dir, folder);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, name), out);
  return `${UPLOAD_URL_PREFIX}/${folder}/${name}`;
}

/** Best-effort cleanup of files WE wrote (anything else, such as a committed seed photo, is left alone). */
export async function removePhotos(cfg: UploadConfig, urls: string[]): Promise<void> {
  await Promise.all(
    urls.map((u) => {
      const m = /^\/api\/v1\/uploads\/(reviews)\/([\w-]+\.webp)$/.exec(u);
      // The strict pattern (random uuid names only) is what keeps a crafted path from escaping the folder.
      return m ? unlink(join(cfg.dir, m[1]!, m[2]!)).catch(() => undefined) : Promise.resolve();
    }),
  );
}

// Parses `multipart/form-data` into memory (never to a temp path chosen by the client). Limits
// are enforced WHILE streaming, so an oversize file is cut off rather than buffered whole: at
// most 3 files x 3 MB. A request that is not multipart (plain JSON) passes straight through.
const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_REVIEW_PHOTOS,
    fileSize: MAX_REVIEW_PHOTO_BYTES,
    fields: 12,
    fieldSize: 16 * 1024,
    parts: MAX_REVIEW_PHOTOS + 12,
  },
}).array('photos', MAX_REVIEW_PHOTOS);

export const parseReviewUpload: RequestHandler = (req, res, next) => {
  parser(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Each photo can be at most 3 MB.',
            undefined,
            413,
          ),
        );
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(validation(undefined, `You can attach up to ${MAX_REVIEW_PHOTOS} photos.`));
        return;
      }
      next(validation(undefined, 'The upload could not be read.'));
      return;
    }
    next(err);
  });
};
