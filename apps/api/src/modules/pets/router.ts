import {
  IdParamsSchema,
  PetInputSchema,
  PetListResponseSchema,
  PetMergeBodySchema,
  PetResponseSchema,
  PetUpdateSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';

import * as service from './service.ts';

// Pet profiles belong to an account; a guest's pets stay in the browser (see the web feature) and
// arrive through /account/pets/merge after sign-in. Mounted after `attachUser`, with the other
// /account routes, so nothing here is ever cached publicly.
export function createPetsRouter(): Router {
  const router = ExpressRouter();
  router.use('/account/pets', requireUser);

  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  router.get('/account/pets', async (req, res) => {
    respond(res, PetListResponseSchema, { data: await service.listPets(userId(req)) });
  });

  const create = { body: PetInputSchema };
  router.post('/account/pets', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    res.status(201);
    respond(res, PetResponseSchema, { data: await service.createPet(userId(req), body) });
  });

  // Declared before `/:id` so "merge" is never read as an id.
  const merge = { body: PetMergeBodySchema };
  router.post('/account/pets/merge', validate(merge), async (req, res) => {
    const { body } = valid(req, merge);
    respond(res, PetListResponseSchema, {
      data: await service.mergePets(userId(req), body.pets),
    });
  });

  const update = { params: IdParamsSchema, body: PetUpdateSchema };
  router.patch('/account/pets/:id', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    respond(res, PetResponseSchema, {
      data: await service.updatePet(userId(req), params.id, body),
    });
  });

  const byId = { params: IdParamsSchema };
  router.delete('/account/pets/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    await service.deletePet(userId(req), params.id);
    res.status(204).end();
  });

  return router;
}
