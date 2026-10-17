import {
  archiveTemplateInputSchema,
  createTemplateInputSchema,
  publishTemplateInputSchema,
  templateDraftInputSchema,
  templateListQuerySchema,
  updateTemplateInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError, validationError } from '../lib/http';
import type { TemplateService } from '../services/templates';

/**
 * Template administration (Phase 4, Step 22).
 *
 * Admins manage every template; Managers may read published templates and their
 * published versions. All guards live here and in the service (admins-only
 * mutations, published-only reads for non-admins).
 */
export function createTemplatesRouter(auth: Auth, service: TemplateService): Router {
  const router = Router();
  const session = requireActiveSession(auth);

  function actor(req: { auth?: { profile: UserProfile } }): UserProfile {
    const profile = req.auth?.profile;

    if (!profile) {
      throw unauthorizedError();
    }

    return profile;
  }

  router.get(
    '/',
    ...session,
    asyncHandler(async (req, res) => {
      const query = templateListQuerySchema.parse(req.query);
      const page = await service.listTemplates(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = createTemplateInputSchema.parse(req.body);
      const created = await service.createTemplate(actor(req), input);

      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const template = await service.getTemplate(actor(req), pathParam(req.params.id, 'template'));

      if (!template) {
        throw notFoundError('Template not found');
      }

      res.status(200).json({ data: template });
    }),
  );

  router.patch(
    '/:id',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = updateTemplateInputSchema.parse(req.body);
      const updated = await service.updateTemplate(
        actor(req),
        pathParam(req.params.id, 'template'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.put(
    '/:id/draft',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const draft = templateDraftInputSchema.parse(req.body);
      const saved = await service.replaceDraft(
        actor(req),
        pathParam(req.params.id, 'template'),
        draft,
      );

      res.status(200).json({ data: saved });
    }),
  );

  router.post(
    '/:id/draft',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const draft = await service.ensureDraft(actor(req), pathParam(req.params.id, 'template'));

      res.status(200).json({ data: draft });
    }),
  );

  router.post(
    '/:id/validate',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const version = parseOptionalVersion(req.body?.version);
      const result = await service.validateVersion(
        actor(req),
        pathParam(req.params.id, 'template'),
        version,
      );

      res.status(200).json({ data: result });
    }),
  );

  router.post(
    '/:id/publish',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = publishTemplateInputSchema.parse(req.body ?? {});
      const published = await service.publishTemplate(
        actor(req),
        pathParam(req.params.id, 'template'),
        input,
      );

      res.status(200).json({ data: published });
    }),
  );

  router.post(
    '/:id/archive',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = archiveTemplateInputSchema.parse(req.body);
      const archived = await service.archiveTemplate(
        actor(req),
        pathParam(req.params.id, 'template'),
        input,
      );

      res.status(200).json({ data: archived });
    }),
  );

  router.get(
    '/:id/versions/:version',
    ...session,
    asyncHandler(async (req, res) => {
      const version = Number(req.params.version);

      if (!Number.isInteger(version) || version < 1) {
        throw validationError('A valid version number is required');
      }

      const detail = await service.getTemplateVersion(
        actor(req),
        pathParam(req.params.id, 'template'),
        version,
      );

      if (!detail) {
        throw notFoundError('Template version not found');
      }

      res.status(200).json({ data: detail });
    }),
  );

  return router;
}

function parseOptionalVersion(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError('A valid version number is required');
  }

  return parsed;
}
