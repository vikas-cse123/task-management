import {
  assignClientRole,
  createClientRecord,
  deactivateClientTeamMember,
  findClient,
  findClientRoleAssignment,
  findExistingJobRoleIds,
  isActiveClientMember,
  listClientRoleAssignments,
  listClients,
  listClientTeamMembers,
  MongoEmployeeDirectory,
  removeClientRole,
  updateClientRecord,
  upsertClientTeamMember,
  type ClientServiceDeps,
  type EmployeeDirectory,
} from '@interscale/db';
import type {
  ClientListQuery,
  ClientRoleAssignmentInput,
  ClientRoleAssignmentView,
  ClientSummary,
  ClientTeamMemberUpdate,
  ClientTeamMemberView,
  CreateClientInput,
  UpdateClientInput,
  UserProfile,
} from '@interscale/shared';
import { hasCapability } from '@interscale/shared';
import { NotFoundError } from '@interscale/db';
import { forbiddenError } from '../lib/http';

/**
 * Client, client-team and designated-role orchestration (Step 5).
 *
 * Scope and permission rules (docs/03-authorization.md):
 * - Admins see and manage every client.
 * - Managers/Employees see only clients where they hold an active team
 *   membership. Out-of-scope reads and writes return 404 so client existence
 *   cannot be probed (IDOR prevention).
 * - Editing a client additionally requires `clients.manage`; managing team
 *   memberships and designated roles requires `clients.team.manage`.
 * - Creating a client is Admin-only.
 *
 * Routers add session middleware; every check here is server-side on the
 * resolved actor profile.
 */

export interface ClientPage {
  readonly data: ClientSummary[];
  readonly nextCursor: string | null;
}

export interface ClientService {
  listClients(actor: UserProfile, query: ClientListQuery): Promise<ClientPage>;
  getClient(actor: UserProfile, id: string): Promise<ClientSummary | null>;
  createClient(actor: UserProfile, input: CreateClientInput): Promise<ClientSummary>;
  updateClient(actor: UserProfile, id: string, input: UpdateClientInput): Promise<ClientSummary>;
  listTeam(actor: UserProfile, id: string): Promise<ClientTeamMemberView[]>;
  setTeamMember(
    actor: UserProfile,
    id: string,
    userId: string,
    input: ClientTeamMemberUpdate,
  ): Promise<ClientTeamMemberView>;
  removeTeamMember(actor: UserProfile, id: string, userId: string): Promise<ClientTeamMemberView>;
  listRoles(actor: UserProfile, id: string): Promise<ClientRoleAssignmentView[]>;
  assignRole(
    actor: UserProfile,
    id: string,
    input: ClientRoleAssignmentInput,
  ): Promise<ClientRoleAssignmentView>;
  removeRole(
    actor: UserProfile,
    id: string,
    assignmentId: string,
  ): Promise<ClientRoleAssignmentView>;
}

function isAdmin(actor: UserProfile): boolean {
  return actor.accessLevel === 'Admin';
}

export function createClientService(
  directory: EmployeeDirectory = new MongoEmployeeDirectory(),
): ClientService {
  const deps: ClientServiceDeps = { directory };

  async function requireInScope(actor: UserProfile, id: string): Promise<ClientSummary> {
    if (!isAdmin(actor)) {
      const inScope = await isActiveClientMember(id, actor.id);

      if (!inScope) {
        throw new NotFoundError('Client');
      }
    }

    const client = await findClient(id);

    if (!client) {
      throw new NotFoundError('Client');
    }

    return client;
  }

  async function requireManage(actor: UserProfile, id: string): Promise<ClientSummary> {
    if (
      !isAdmin(actor) &&
      !hasCapability(actor.accessLevel, actor.capabilities, 'clients.manage')
    ) {
      // Distinguish "no such client / no access" (404) from "access without
      // permission" (403) so membership alone never leaks existence.
      await requireInScope(actor, id);
      throw forbiddenError('Managing this client requires the clients.manage capability');
    }

    return requireInScope(actor, id);
  }

  async function requireTeamManage(actor: UserProfile, id: string): Promise<ClientSummary> {
    if (
      !isAdmin(actor) &&
      !hasCapability(actor.accessLevel, actor.capabilities, 'clients.team.manage')
    ) {
      await requireInScope(actor, id);
      throw forbiddenError('Managing this client team requires the clients.team.manage capability');
    }

    return requireInScope(actor, id);
  }

  return {
    async listClients(actor, query) {
      const page = await listClients(
        query,
        isAdmin(actor) ? { kind: 'all' } : { kind: 'member', userId: actor.id },
      );

      return { data: page.data, nextCursor: page.nextCursor };
    },

    async getClient(actor, id) {
      try {
        return await requireInScope(actor, id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return null;
        }

        throw error;
      }
    },

    async createClient(actor, input) {
      if (!isAdmin(actor)) {
        throw forbiddenError('Only Admins can create clients');
      }

      return createClientRecord(input, actor.id, deps);
    },

    async updateClient(actor, id, input) {
      await requireManage(actor, id);
      return updateClientRecord(id, input, actor.id, deps);
    },

    async listTeam(actor, id) {
      await requireInScope(actor, id);
      return listClientTeamMembers(id);
    },

    async setTeamMember(actor, id, userId, input) {
      await requireTeamManage(actor, id);
      return upsertClientTeamMember(actor.id, id, userId, input, deps);
    },

    async removeTeamMember(actor, id, userId) {
      await requireTeamManage(actor, id);
      return deactivateClientTeamMember(actor.id, id, userId);
    },

    async listRoles(actor, id) {
      await requireInScope(actor, id);
      return listClientRoleAssignments(id);
    },

    async assignRole(actor, id, input) {
      await requireTeamManage(actor, id);

      const existingJobRoles = await findExistingJobRoleIds([input.jobRoleId]);

      if (existingJobRoles.length !== 1) {
        throw new NotFoundError('Job role');
      }

      const result = await assignClientRole(
        {
          clientId: id,
          jobRoleId: input.jobRoleId,
          userId: input.userId,
          isPrimary: input.isPrimary,
          actorId: actor.id,
        },
        { directory },
      );

      const view = await findClientRoleAssignment(result.assignmentId);

      if (!view) {
        throw new NotFoundError('Client role assignment');
      }

      return view;
    },

    async removeRole(actor, id, assignmentId) {
      const assignment = await findClientRoleAssignment(assignmentId);

      if (!assignment || assignment.clientId !== id) {
        throw new NotFoundError('Client role assignment');
      }

      await requireTeamManage(actor, id);

      const result = await removeClientRole(
        {
          clientId: id,
          jobRoleId: assignment.jobRoleId,
          userId: assignment.userId,
          actorId: actor.id,
        },
        { directory },
      );

      return {
        ...assignment,
        isPrimary: result.isPrimary,
        isActive: result.isActive,
      };
    },
  };
}
