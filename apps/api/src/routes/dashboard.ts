import type { UserProfile } from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { unauthorizedError } from '../lib/http';
import type { DashboardService } from '../services/dashboard';

/** Role-scoped dashboard summary (Step 11). */
export function createDashboardRouter(auth: Auth, service: DashboardService): Router {
  const router = Router();

  router.get(
    '/summary',
    ...requireActiveSession(auth),
    asyncHandler(async (req, res) => {
      const profile: UserProfile | undefined = req.auth?.profile;

      if (!profile) {
        throw unauthorizedError();
      }

      res.status(200).json({ data: await service.getSummary(profile) });
    }),
  );

  return router;
}
