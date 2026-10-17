import { randomUUID } from 'node:crypto';
import { API_PREFIX } from '@interscale/shared';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { createV1Router } from './routes/v1';

/**
 * Build the Express application.
 *
 * The Better Auth handler and authentication/authorization middleware are
 * mounted in later approved steps. This factory intentionally excludes
 * `listen()` so it can be exercised directly by integration tests.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? randomUUID(),
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use(API_PREFIX, createV1Router());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
