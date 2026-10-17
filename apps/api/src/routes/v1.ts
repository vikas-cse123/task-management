import { API_PREFIX, APP_NAME } from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import type { ClientService } from '../services/clients';
import type { DashboardService } from '../services/dashboard';
import type { EmployeeAdminService } from '../services/employees';
import type { GenerationService } from '../services/generation';
import type { ProjectService } from '../services/projects';
import type { ReferenceDataService } from '../services/reference-data';
import type { TaskService } from '../services/tasks';
import type { TemplateService } from '../services/templates';
import type { UserAccountWriter } from '../services/user-account';
import { createClientsRouter } from './clients';
import { createDashboardRouter } from './dashboard';
import { createGenerationRouter } from './generation';
import { createMeRouter } from './me';
import { createProjectsRouter } from './projects';
import { createTasksRouter } from './tasks';
import { createTemplatesRouter } from './templates';
import { createReferenceDataRouter } from './reference-data';
import { createUsersRouter } from './users';

export interface V1RouterDeps {
  /** Better Auth instance. When absent, auth-dependent routes are not mounted. */
  auth?: Auth;
  /** Account-profile writer. Required when `auth` is supplied. */
  userAccount?: UserAccountWriter;
  /** Employee administration service (Admin API). */
  employeeAdmin?: EmployeeAdminService;
  /** Departments and job-role reference data. */
  referenceData?: ReferenceDataService;
  /** Client management and client-specific teams. */
  clients?: ClientService;
  /** Project management. */
  projects?: ProjectService;
  /** Task management. */
  tasks?: TaskService;
  /** Dashboard aggregates. */
  dashboard?: DashboardService;
  /** Template administration (Phase 4). */
  templates?: TemplateService;
  /** Project generation from a published template (Phase 4). */
  generation?: GenerationService;
}

/**
 * Versioned application router. Domain modules are mounted here as each
 * approved step lands.
 */
export function createV1Router(deps: V1RouterDeps = {}): Router {
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

  if (deps.auth && deps.userAccount) {
    router.use('/me', createMeRouter(deps.auth, deps.userAccount));
  }

  if (deps.auth && deps.employeeAdmin) {
    router.use('/users', createUsersRouter(deps.auth, deps.employeeAdmin));
  }

  if (deps.auth && deps.referenceData) {
    router.use('/reference-data', createReferenceDataRouter(deps.auth, deps.referenceData));
  }

  if (deps.auth && deps.clients) {
    router.use('/clients', createClientsRouter(deps.auth, deps.clients, deps.projects));
  }

  if (deps.auth && deps.generation) {
    router.use('/projects', createGenerationRouter(deps.auth, deps.generation));
  }

  if (deps.auth && deps.projects) {
    router.use('/projects', createProjectsRouter(deps.auth, deps.projects));
  }

  if (deps.auth && deps.templates) {
    router.use('/templates', createTemplatesRouter(deps.auth, deps.templates));
  }

  if (deps.auth && deps.tasks) {
    router.use(createTasksRouter(deps.auth, deps.tasks, deps.projects));
  }

  if (deps.auth && deps.dashboard) {
    router.use('/dashboard', createDashboardRouter(deps.auth, deps.dashboard));
  }

  return router;
}
