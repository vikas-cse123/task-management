import {
  createEmployeeInputSchema,
  employeeListQuerySchema,
  updateEmployeeInputSchema,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { EmployeeAdminService } from '../services/employees';

/**
 * Employee administration (Admin only).
 *
 * Every route is guarded by a valid, active session that has already cleared the
 * forced password change and holds the Admin access level. The actor id is read
 * from the server-resolved session, never from the request body.
 */
export function createUsersRouter(auth: Auth, service: EmployeeAdminService): Router {
  const router = Router();
  const admin = [...requireActiveSession(auth), requireAdmin()];

  router.get(
    '/',
    ...admin,
    asyncHandler(async (req, res) => {
      const query = employeeListQuerySchema.parse(req.query);
      const page = await service.list(query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/',
    ...admin,
    asyncHandler(async (req, res) => {
      const input = createEmployeeInputSchema.parse(req.body);
      const actorId = req.auth?.profile.id;

      if (!actorId) {
        throw unauthorizedError();
      }

      const created = await service.create(actorId, input);
      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/:id',
    ...admin,
    asyncHandler(async (req, res) => {
      const user = await service.get(pathParam(req.params.id, 'employee'));

      if (!user) {
        throw notFoundError('Employee not found');
      }

      res.status(200).json({ data: user });
    }),
  );

  router.patch(
    '/:id',
    ...admin,
    asyncHandler(async (req, res) => {
      const input = updateEmployeeInputSchema.parse(req.body);
      const actorId = req.auth?.profile.id;

      if (!actorId) {
        throw unauthorizedError();
      }

      const user = await service.update(actorId, pathParam(req.params.id, 'employee'), input);
      res.status(200).json({ data: user });
    }),
  );

  router.post(
    '/:id/sessions/revoke',
    ...admin,
    asyncHandler(async (req, res) => {
      const actorId = req.auth?.profile.id;

      if (!actorId) {
        throw unauthorizedError();
      }

      const result = await service.revokeSessions(actorId, pathParam(req.params.id, 'employee'));
      res.status(200).json({ data: result });
    }),
  );

  return router;
}
