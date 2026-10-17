import { API_PREFIX, APP_NAME } from '@interscale/shared';
import { Router } from 'express';

/**
 * Versioned application router. Domain modules (users, clients, departments,
 * job roles, ...) are mounted here in later approved steps.
 */
export function createV1Router(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      data: {
        status: 'ok',
        service: APP_NAME,
        apiPrefix: API_PREFIX,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
