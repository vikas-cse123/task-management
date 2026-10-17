import {
  clientListQuerySchema,
  clientRoleAssignmentInputSchema,
  clientTeamMemberUpdateSchema,
  createClientInputSchema,
  projectListQuerySchema,
  updateClientInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { ClientService } from '../services/clients';
import type { ProjectService } from '../services/projects';

/**
 * Client management and client-specific teams (Step 5).
 *
 * Every route requires a valid, active session that has cleared the forced
 * password change. Client creation is Admin-only; all other guards
 * (scope + `clients.manage` / `clients.team.manage`) live in the service so
 * out-of-scope access returns 404 instead of leaking client existence.
 */
export function createClientsRouter(
  auth: Auth,
  service: ClientService,
  projects?: ProjectService,
): Router {
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
      const query = clientListQuerySchema.parse(req.query);
      const page = await service.listClients(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/',
    ...session,
    requireAdmin(),
    asyncHandler(async (req, res) => {
      const input = createClientInputSchema.parse(req.body);
      const created = await service.createClient(actor(req), input);

      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const client = await service.getClient(actor(req), pathParam(req.params.id, 'client'));

      if (!client) {
        throw notFoundError('Client not found');
      }

      res.status(200).json({ data: client });
    }),
  );

  router.patch(
    '/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const input = updateClientInputSchema.parse(req.body);
      const client = await service.updateClient(
        actor(req),
        pathParam(req.params.id, 'client'),
        input,
      );

      res.status(200).json({ data: client });
    }),
  );

  router.get(
    '/:id/team',
    ...session,
    asyncHandler(async (req, res) => {
      const members = await service.listTeam(actor(req), pathParam(req.params.id, 'client'));

      res.status(200).json({ data: members });
    }),
  );

  router.put(
    '/:id/team/:userId',
    ...session,
    asyncHandler(async (req, res) => {
      const input = clientTeamMemberUpdateSchema.parse(req.body);
      const member = await service.setTeamMember(
        actor(req),
        pathParam(req.params.id, 'client'),
        pathParam(req.params.userId, 'employee'),
        input,
      );

      res.status(200).json({ data: member });
    }),
  );

  router.delete(
    '/:id/team/:userId',
    ...session,
    asyncHandler(async (req, res) => {
      const member = await service.removeTeamMember(
        actor(req),
        pathParam(req.params.id, 'client'),
        pathParam(req.params.userId, 'employee'),
      );

      res.status(200).json({ data: member });
    }),
  );

  router.get(
    '/:id/roles',
    ...session,
    asyncHandler(async (req, res) => {
      const roles = await service.listRoles(actor(req), pathParam(req.params.id, 'client'));

      res.status(200).json({ data: roles });
    }),
  );

  router.post(
    '/:id/roles',
    ...session,
    asyncHandler(async (req, res) => {
      const input = clientRoleAssignmentInputSchema.parse(req.body);
      const assignment = await service.assignRole(
        actor(req),
        pathParam(req.params.id, 'client'),
        input,
      );

      res.status(201).json({ data: assignment });
    }),
  );

  router.delete(
    '/:id/roles/:assignmentId',
    ...session,
    asyncHandler(async (req, res) => {
      const assignment = await service.removeRole(
        actor(req),
        pathParam(req.params.id, 'client'),
        pathParam(req.params.assignmentId, 'client role assignment'),
      );

      res.status(200).json({ data: assignment });
    }),
  );

  if (projects) {
    const projectService = projects;

    router.get(
      '/:id/projects',
      ...session,
      asyncHandler(async (req, res) => {
        const query = projectListQuerySchema.parse({
          ...req.query,
          clientId: pathParam(req.params.id, 'client'),
        });
        const page = await projectService.listProjects(actor(req), query);

        res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
      }),
    );
  }

  return router;
}
