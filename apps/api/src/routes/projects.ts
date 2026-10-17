import {
  changeProjectStatusInputSchema,
  createProjectInputSchema,
  projectListQuerySchema,
  updateProjectInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { ProjectService } from '../services/projects';

/**
 * Project management (Step 7).
 *
 * Every route requires a valid, active session that has cleared the forced
 * password change. Project creation is Admin-only; all other guards (scope +
 * `clients.manage`) live in the service so out-of-scope access returns 404.
 */
export function createProjectsRouter(auth: Auth, service: ProjectService): Router {
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
      const query = projectListQuerySchema.parse(req.query);
      const page = await service.listProjects(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = createProjectInputSchema.parse(req.body);
      const created = await service.createProject(actor(req), input);

      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const project = await service.getProject(actor(req), pathParam(req.params.id, 'project'));

      if (!project) {
        throw notFoundError('Project not found');
      }

      res.status(200).json({ data: project });
    }),
  );

  router.patch(
    '/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const input = updateProjectInputSchema.parse(req.body);
      const project = await service.updateProject(
        actor(req),
        pathParam(req.params.id, 'project'),
        input,
      );

      res.status(200).json({ data: project });
    }),
  );

  router.patch(
    '/:id/status',
    ...session,
    asyncHandler(async (req, res) => {
      const input = changeProjectStatusInputSchema.parse(req.body);
      const project = await service.changeProjectStatus(
        actor(req),
        pathParam(req.params.id, 'project'),
        input,
      );

      res.status(200).json({ data: project });
    }),
  );

  router.get(
    '/:id/activity',
    ...session,
    asyncHandler(async (req, res) => {
      const activity = await service.listProjectActivity(
        actor(req),
        pathParam(req.params.id, 'project'),
      );

      res.status(200).json({ data: activity });
    }),
  );

  router.get(
    '/:id/reviews',
    ...session,
    asyncHandler(async (req, res) => {
      const reviews = await service.listProjectReviews(
        actor(req),
        pathParam(req.params.id, 'project'),
      );

      res.status(200).json({ data: reviews });
    }),
  );

  return router;
}
