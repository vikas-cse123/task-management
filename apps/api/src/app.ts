import { randomUUID } from 'node:crypto';
import { API_PREFIX } from '@interscale/shared';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { AUTH_BASE_PATH, type Auth } from './auth/auth';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { createV1Router } from './routes/v1';
import { createWhatsAppWebhookRouter, type WhatsAppWebhookConfig } from './routes/webhooks';
import { createClientService, type ClientService } from './services/clients';
import { createDashboardService, type DashboardService } from './services/dashboard';
import { createEmployeeAdminService, type EmployeeAdminService } from './services/employees';
import { createGenerationService, type GenerationService } from './services/generation';
import { createMeetingService, type MeetingService } from './services/meetings';
import { createNotificationService, type NotificationApiService } from './services/notifications';
import { createProjectService, type ProjectService } from './services/projects';
import { createTaskService, type TaskService } from './services/tasks';
import { createTemplateService, type TemplateService } from './services/templates';
import { dbReferenceDataService, type ReferenceDataService } from './services/reference-data';
import { dbUserAccountWriter, type UserAccountWriter } from './services/user-account';

export interface CreateAppOptions {
  /**
   * Better Auth instance. The authentication handler is mounted only when it is
   * supplied, which keeps the health/error surface testable without a database.
   */
  auth?: Auth;
  /** Account-profile writer (defaults to the database-backed implementation). */
  userAccount?: UserAccountWriter;
  /** Employee administration service (defaults to the database-backed one). */
  employeeAdmin?: EmployeeAdminService;
  /** Departments and job-role reference data. */
  referenceData?: ReferenceDataService;
  /** Client service (defaults to the database-backed implementation). */
  clients?: ClientService;
  /** Project service (defaults to the database-backed implementation). */
  projects?: ProjectService;
  /** Task service (defaults to the database-backed implementation). */
  tasks?: TaskService;
  /** Dashboard service (defaults to the database-backed implementation). */
  dashboard?: DashboardService;
  /** Template administration (Phase 4). */
  templates?: TemplateService;
  /** Project generation from a published template (Phase 4). */
  generation?: GenerationService;
  /** Notification center, consent, and Admin administration (Phase 5). */
  notifications?: NotificationApiService;
  /** Meeting management (Phase 6). */
  meetings?: MeetingService;
  /** WhatsApp webhook verification/handling (Phase 5). */
  whatsappWebhook?: WhatsAppWebhookConfig;
}

/**
 * Build the Express application.
 *
 * The Better Auth handler is mounted **before** `express.json()` so it can read
 * the raw request body itself. This factory intentionally excludes `listen()`
 * so it can be exercised directly by integration tests.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const userAccount = options.userAccount ?? dbUserAccountWriter;
  const employeeAdmin =
    options.employeeAdmin ?? (options.auth ? createEmployeeAdminService(options.auth) : undefined);
  const referenceData = options.referenceData ?? dbReferenceDataService;
  const clients = options.clients ?? createClientService();
  const projects = options.projects ?? createProjectService();
  const tasks = options.tasks ?? createTaskService();
  const dashboard = options.dashboard ?? createDashboardService();
  const templates = options.templates ?? createTemplateService();
  const generation = options.generation ?? createGenerationService();
  const notifications = options.notifications ?? createNotificationService();
  const meetings = options.meetings ?? createMeetingService();

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

  if (options.auth) {
    app.all(`${AUTH_BASE_PATH}/*splat`, toNodeHandler(options.auth));
  }

  // Mount the WhatsApp webhook with a raw body parser *before* `express.json()`
  // so the X-Hub-Signature-256 header can be verified over the exact bytes.
  app.use(
    `${API_PREFIX}/webhooks`,
    express.raw({ type: '*/*', limit: '1mb' }),
    createWhatsAppWebhookRouter(
      options.whatsappWebhook ?? {
        verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
        appSecret: env.WHATSAPP_APP_SECRET ?? null,
      },
    ),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use(
    API_PREFIX,
    apiRateLimiter,
    createV1Router({
      auth: options.auth,
      userAccount,
      employeeAdmin,
      referenceData,
      clients,
      projects,
      tasks,
      dashboard,
      templates,
      generation,
      notifications,
      meetings,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
