import {
  AdminContactListResponseSchema,
  AdminContactResponseSchema,
  AdminContactUpdateSchema,
  AdminGuideInputSchema,
  AdminGuideListResponseSchema,
  AdminGuideResponseSchema,
  AdminHelpInputSchema,
  AdminHelpListResponseSchema,
  AdminHelpResponseSchema,
  AdminHomeContentParamsSchema,
  AdminHomeContentPutSchema,
  AdminHomeContentResponseSchema,
  AdminTestimonialInputSchema,
  AdminTestimonialListResponseSchema,
  AdminTestimonialResponseSchema,
  AdminWithdrawalListResponseSchema,
  AdminWithdrawalResponseSchema,
  AdminWithdrawalUpdateSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

// Content management: guides, help articles, testimonials, withdrawals, contact messages and the
// homepage blocks. Every route is behind `requireAdmin` (mounted by the admin router). Replace
// semantics: PUT sends the whole document, because the editors submit whole forms.
export function createAdminContentRouter(): Router {
  const router = ExpressRouter();
  const byId = { params: IdParamsSchema };

  // ----- guides -----
  router.get('/guides', async (_req, res) => {
    respond(res, AdminGuideListResponseSchema, { data: await service.listGuides() });
  });
  const guideBody = { body: AdminGuideInputSchema };
  router.post('/guides', validate(guideBody), async (req, res) => {
    const { body } = valid(req, guideBody);
    const guide = await service.createGuide(body);
    setAudit(res, 'guide.create', guide.id);
    res.status(201);
    respond(res, AdminGuideResponseSchema, { data: guide });
  });
  router.get('/guides/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminGuideResponseSchema, { data: await service.getGuide(params.id) });
  });
  const guideUpdate = { params: IdParamsSchema, body: AdminGuideInputSchema };
  router.put('/guides/:id', validate(guideUpdate), async (req, res) => {
    const { params, body } = valid(req, guideUpdate);
    setAudit(res, 'guide.update', params.id);
    respond(res, AdminGuideResponseSchema, { data: await service.updateGuide(params.id, body) });
  });
  router.delete('/guides/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'guide.delete', params.id);
    await service.deleteGuide(params.id);
    res.status(204).end();
  });

  // ----- help articles -----
  router.get('/help-articles', async (_req, res) => {
    respond(res, AdminHelpListResponseSchema, { data: await service.listHelp() });
  });
  const helpBody = { body: AdminHelpInputSchema };
  router.post('/help-articles', validate(helpBody), async (req, res) => {
    const { body } = valid(req, helpBody);
    const article = await service.createHelp(body);
    setAudit(res, 'help_article.create', article.id);
    res.status(201);
    respond(res, AdminHelpResponseSchema, { data: article });
  });
  const helpUpdate = { params: IdParamsSchema, body: AdminHelpInputSchema };
  router.put('/help-articles/:id', validate(helpUpdate), async (req, res) => {
    const { params, body } = valid(req, helpUpdate);
    setAudit(res, 'help_article.update', params.id);
    respond(res, AdminHelpResponseSchema, { data: await service.updateHelp(params.id, body) });
  });
  router.delete('/help-articles/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'help_article.delete', params.id);
    await service.deleteHelp(params.id);
    res.status(204).end();
  });

  // ----- testimonials -----
  router.get('/testimonials', async (_req, res) => {
    respond(res, AdminTestimonialListResponseSchema, { data: await service.listTestimonials() });
  });
  const testimonialBody = { body: AdminTestimonialInputSchema };
  router.post('/testimonials', validate(testimonialBody), async (req, res) => {
    const { body } = valid(req, testimonialBody);
    const t = await service.createTestimonial(body);
    setAudit(res, 'testimonial.create', t.id);
    res.status(201);
    respond(res, AdminTestimonialResponseSchema, { data: t });
  });
  const testimonialUpdate = { params: IdParamsSchema, body: AdminTestimonialInputSchema };
  router.put('/testimonials/:id', validate(testimonialUpdate), async (req, res) => {
    const { params, body } = valid(req, testimonialUpdate);
    setAudit(res, 'testimonial.update', params.id);
    respond(res, AdminTestimonialResponseSchema, {
      data: await service.updateTestimonial(params.id, body),
    });
  });
  router.delete('/testimonials/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'testimonial.delete', params.id);
    await service.deleteTestimonial(params.id);
    res.status(204).end();
  });

  // ----- withdrawals -----
  router.get('/withdrawals', async (_req, res) => {
    respond(res, AdminWithdrawalListResponseSchema, { data: await service.listWithdrawals() });
  });
  const withdrawalUpdate = { params: IdParamsSchema, body: AdminWithdrawalUpdateSchema };
  router.patch('/withdrawals/:id', validate(withdrawalUpdate), async (req, res) => {
    const { params, body } = valid(req, withdrawalUpdate);
    setAudit(res, `withdrawal.${body.status}`, params.id);
    respond(res, AdminWithdrawalResponseSchema, {
      data: await service.setWithdrawalStatus(params.id, body.status),
    });
  });

  // ----- contact messages -----
  router.get('/contact-messages', async (_req, res) => {
    respond(res, AdminContactListResponseSchema, { data: await service.listContactMessages() });
  });
  const contactUpdate = { params: IdParamsSchema, body: AdminContactUpdateSchema };
  router.patch('/contact-messages/:id', validate(contactUpdate), async (req, res) => {
    const { params, body } = valid(req, contactUpdate);
    setAudit(res, body.handled ? 'contact.handled' : 'contact.reopened', params.id);
    respond(res, AdminContactResponseSchema, {
      data: await service.setContactHandled(params.id, body.handled),
    });
  });

  // ----- homepage blocks -----
  router.get('/home-content', async (_req, res) => {
    respond(res, AdminHomeContentResponseSchema, { data: await service.getHome() });
  });
  const homePut = { params: AdminHomeContentParamsSchema, body: AdminHomeContentPutSchema };
  router.put('/home-content/:key', validate(homePut), async (req, res) => {
    const { params, body } = valid(req, homePut);
    setAudit(res, 'home_content.update', params.key);
    respond(res, AdminHomeContentResponseSchema, {
      data: await service.putHome(params.key, body.value),
    });
  });

  return router;
}
