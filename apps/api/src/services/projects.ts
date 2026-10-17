import {
  changeProjectStatus as dbChangeProjectStatus,
  createProjectRecord,
  findProject,
  findProjectDetail,
  hasAssignedWorkInProject,
  isActiveClientMember,
  listEntityActivity,
  listProjects as dbListProjects,
  MongoEmployeeDirectory,
  updateProjectRecord,
  type ProjectServiceDeps,
  type EmployeeDirectory,
} from '@interscale/db';
import { NotFoundError } from '@interscale/db';
import type {
  AuditEntry,
  ChangeProjectStatusInput,
  CreateProjectInput,
  ProjectDetail,
  ProjectListQuery,
  ProjectSummary,
  UpdateProjectInput,
  UserProfile,
} from '@interscale/shared';
import { hasCapability } from '@interscale/shared';
import { forbiddenError } from '../lib/http';

/**
 * Project orchestration (Step 7).
 *
 * Scope rules (docs/03-authorization.md):
 * - Admins see and manage every project; only Admins create projects.
 * - Managers read projects under clients where they hold an active
 *   membership, and edit them with the `clients.manage` capability.
 * - Employees read only projects containing their own non-cancelled assigned
 *   work. Out-of-scope access returns 404 (IDOR prevention).
 */

export interface ProjectPage {
  readonly data: ProjectSummary[];
  readonly nextCursor: string | null;
}

export interface ProjectService {
  listProjects(actor: UserProfile, query: ProjectListQuery): Promise<ProjectPage>;
  getProject(actor: UserProfile, id: string): Promise<ProjectDetail | null>;
  createProject(actor: UserProfile, input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(actor: UserProfile, id: string, input: UpdateProjectInput): Promise<ProjectSummary>;
  changeProjectStatus(
    actor: UserProfile,
    id: string,
    input: ChangeProjectStatusInput,
  ): Promise<ProjectSummary>;
  listProjectActivity(actor: UserProfile, id: string): Promise<AuditEntry[]>;
}

function isAdmin(actor: UserProfile): boolean {
  return actor.accessLevel === 'Admin';
}

export function createProjectService(
  directory: EmployeeDirectory = new MongoEmployeeDirectory(),
): ProjectService {
  const deps: ProjectServiceDeps = { directory };

  async function requireInScope(actor: UserProfile, id: string): Promise<ProjectSummary> {
    const project = await findProject(id);

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (isAdmin(actor)) {
      return project;
    }

    if (actor.accessLevel === 'Manager') {
      const inScope = await isActiveClientMember(project.clientId, actor.id);

      if (!inScope) {
        throw new NotFoundError('Project');
      }

      return project;
    }

    const assigned = await hasAssignedWorkInProject(id, actor.id);

    if (!assigned) {
      throw new NotFoundError('Project');
    }

    return project;
  }

  async function requireManage(actor: UserProfile, id: string): Promise<ProjectSummary> {
    if (
      !isAdmin(actor) &&
      !hasCapability(actor.accessLevel, actor.capabilities, 'clients.manage')
    ) {
      await requireInScope(actor, id);
      throw forbiddenError('Managing this project requires the clients.manage capability');
    }

    return requireInScope(actor, id);
  }

  return {
    async listProjects(actor, query) {
      const scope = isAdmin(actor)
        ? ({ kind: 'all' } as const)
        : actor.accessLevel === 'Manager'
          ? ({ kind: 'member', userId: actor.id } as const)
          : ({ kind: 'assignee', userId: actor.id } as const);

      const page = await dbListProjects(query, scope);
      return { data: page.data, nextCursor: page.nextCursor };
    },

    async getProject(actor, id) {
      try {
        await requireInScope(actor, id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return null;
        }

        throw error;
      }

      return findProjectDetail(id);
    },

    async createProject(actor, input) {
      if (!isAdmin(actor)) {
        throw forbiddenError('Only Admins can create projects');
      }

      return createProjectRecord(input, actor.id, deps);
    },

    async updateProject(actor, id, input) {
      await requireManage(actor, id);
      const { expectedVersion, ...patch } = input;
      return updateProjectRecord(id, patch, actor.id, deps, expectedVersion);
    },

    async changeProjectStatus(actor, id, input) {
      await requireManage(actor, id);
      return dbChangeProjectStatus(id, input.status, actor.id, {
        reason: input.reason ?? null,
        expectedVersion: input.expectedVersion,
      });
    },

    async listProjectActivity(actor, id) {
      await requireInScope(actor, id);
      return listEntityActivity('project', id);
    },
  };
}
