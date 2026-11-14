import {
  AdminGalleryListResponseSchema,
  AdminGalleryResponseSchema,
  GalleryInputSchema,
  GalleryUpdateSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { removeUnreferencedPhotos } from '../../lib/upload-refs.ts';
import { savePhoto, parseGalleryUpload, type UploadConfig } from '../../lib/uploads.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';

import * as service from './service.ts';

// Mounted under /admin (requireAdmin + audit log). The photo itself arrives through `POST
// /admin/gallery/upload` (an admin picks a file; same re-encoding as review photos), which answers
// the path to put in the create form. A path may also point at a committed static photo.
export function createGalleryAdminRouter(deps: { uploads: UploadConfig }): Router {
  const router = ExpressRouter();

  router.get('/gallery', async (_req, res) => {
    respond(res, AdminGalleryListResponseSchema, { data: await service.listAdmin() });
  });

  router.post('/gallery/upload', parseGalleryUpload, async (req, res) => {
    const file = req.file;
    if (!file) throw new Error('missing');
    res.status(201).json({ data: { path: await savePhoto(deps.uploads, file.buffer, 'gallery') } });
  });

  const create = { body: GalleryInputSchema };
  router.post('/gallery', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    const photo = await service.createPhoto(body);
    setAudit(res, 'gallery.create', photo.id);
    res.status(201);
    respond(res, AdminGalleryResponseSchema, { data: photo });
  });

  const update = { params: IdParamsSchema, body: GalleryUpdateSchema };
  router.patch('/gallery/:id', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    setAudit(res, 'gallery.update', params.id);
    const { photo, replacedPath } = await service.updatePhoto(params.id, body);
    // The old file is orphaned by a path change (unless another row still shows it).
    if (replacedPath) await removeUnreferencedPhotos(deps.uploads, [replacedPath]);
    respond(res, AdminGalleryResponseSchema, { data: photo });
  });

  const byId = { params: IdParamsSchema };
  router.delete('/gallery/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'gallery.delete', params.id);
    const path = await service.removePhoto(params.id);
    await removeUnreferencedPhotos(deps.uploads, [path]);
    res.status(204).end();
  });

  return router;
}
