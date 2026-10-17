import { updateReferenceLabelSchema } from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { pathParam, unauthorizedError } from '../lib/http';
import type { ReferenceDataService } from '../services/reference-data';

/**
 * Departments and functional job roles.
 *
 * Any authenticated, active user may read the reference data (the UI needs role
 * names for team views); only an Admin may edit display names/descriptions.
 */
export function createReferenceDataRouter(auth: Auth, service: ReferenceDataService): Router {
  const router = Router();
  const read = requireActiveSession(auth);
  const admin = [...read, requireAdmin()];

  router.get(
    '/departments',
    ...read,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await service.listDepartments() });
    }),
  );

  router.get(
    '/job-roles',
    ...read,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await service.listJobRoles() });
    }),
  );

  router.patch(
    '/departments/:id',
    ...admin,
    asyncHandler(async (req, res) => {
      const input = updateReferenceLabelSchema.parse(req.body);
      const actorId = req.auth?.profile.id;

      if (!actorId) {
        throw unauthorizedError();
      }

      res.status(200).json({
        data: await service.updateDepartment(
          actorId,
          pathParam(req.params.id, 'department'),
          input,
        ),
      });
    }),
  );

  router.patch(
    '/job-roles/:id',
    ...admin,
    asyncHandler(async (req, res) => {
      const input = updateReferenceLabelSchema.parse(req.body);
      const actorId = req.auth?.profile.id;

      if (!actorId) {
        throw unauthorizedError();
      }

      res.status(200).json({
        data: await service.updateJobRole(actorId, pathParam(req.params.id, 'job role'), input),
      });
    }),
  );

  return router;
}
