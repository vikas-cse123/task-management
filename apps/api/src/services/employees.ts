import {
  ConflictError,
  countActiveAdmins,
  findExistingJobRoleIds,
  findUserRecord,
  listUsers,
  NotFoundError,
  recordAudit,
  revokeUserSessions,
  updateUserRecord,
  ValidationError,
  type UserProfilePatch,
  type UserRecord,
} from '@interscale/db';
import type {
  CreateEmployeeInput,
  EmployeeCreated,
  EmployeeListQuery,
  UpdateEmployeeInput,
  UserProfile,
} from '@interscale/shared';
import { randomBytes } from 'node:crypto';
import type { Auth } from '../auth/auth';
import { toUserProfile, type RawUser } from '../auth/user-projection';

/**
 * Admin-only employee administration (Step 4).
 *
 * Orchestrates account creation through Better Auth (password hashing) and
 * profile field updates through the database service, emitting a sanitized
 * audit record for every critical change. All safety rules here are
 * server-side; the routers add the Admin guard.
 */

export interface EmployeeListPage {
  readonly data: UserProfile[];
  readonly nextCursor: string | null;
}

export interface EmployeeAdminService {
  list(query: EmployeeListQuery): Promise<EmployeeListPage>;
  get(id: string): Promise<UserProfile | null>;
  create(actorId: string, input: CreateEmployeeInput): Promise<EmployeeCreated>;
  update(actorId: string, id: string, input: UpdateEmployeeInput): Promise<UserProfile>;
  revokeSessions(actorId: string, id: string): Promise<{ revoked: number }>;
}

function profileOf(record: UserRecord): UserProfile {
  return toUserProfile(record as unknown as RawUser);
}

/** Cryptographically secure temporary password (base64url, 22 chars). */
export function generateTemporaryPassword(): string {
  return randomBytes(16).toString('base64url');
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|USER_ALREADY_EXISTS/i.test(message);
}

export function createEmployeeAdminService(auth: Auth): EmployeeAdminService {
  async function requireRecord(id: string): Promise<UserRecord> {
    const record = await findUserRecord(id);

    if (!record) {
      throw new NotFoundError('Employee');
    }

    return record;
  }

  return {
    async list(query) {
      const page = await listUsers(query);

      return { data: page.data.map(profileOf), nextCursor: page.nextCursor };
    },

    async get(id) {
      const record = await findUserRecord(id);
      return record ? profileOf(record) : null;
    },

    async create(actorId, input) {
      const existingJobRoles = await findExistingJobRoleIds(input.jobRoleIds);

      if (existingJobRoles.length !== input.jobRoleIds.length) {
        throw new ValidationError('One or more selected job roles do not exist');
      }

      const temporaryPassword = generateTemporaryPassword();
      const now = new Date();
      const optInAt = input.whatsappOptIn ? now.toISOString() : null;

      let createdUserId: string;

      try {
        const created = await auth.api.createUser({
          body: {
            email: input.email,
            password: temporaryPassword,
            name: input.name,
            data: {
              accessLevel: input.accessLevel,
              status: 'active',
              requiresPasswordChange: true,
              jobRoleIds: input.jobRoleIds,
              capabilities: input.capabilities,
              whatsappNumber: input.whatsappNumber ?? null,
              whatsappOptIn: input.whatsappOptIn,
              whatsappOptInAt: optInAt,
              whatsappOptInSource: input.whatsappOptIn ? 'admin' : null,
              createdBy: actorId,
            },
          },
        });

        createdUserId = created.user.id;
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          throw new ConflictError('An account with this email already exists');
        }

        throw error;
      }

      await recordAudit({
        actorId,
        action: 'user.create',
        entityType: 'user',
        entityId: createdUserId,
        previousValue: null,
        newValue: {
          email: input.email,
          accessLevel: input.accessLevel,
          jobRoleIds: input.jobRoleIds,
          capabilities: input.capabilities,
        },
        notes: null,
      });

      const record = await findUserRecord(createdUserId);

      if (!record) {
        throw new NotFoundError('Employee');
      }

      return { user: profileOf(record), temporaryPassword };
    },

    async update(actorId, id, input) {
      const current = await requireRecord(id);
      const isSelf = id === actorId;

      if (isSelf && input.accessLevel !== undefined && input.accessLevel !== current.accessLevel) {
        throw new ValidationError('You cannot change your own access level');
      }

      if (isSelf && input.status === 'inactive') {
        throw new ValidationError('You cannot deactivate your own account');
      }

      const removesActiveAdmin =
        current.accessLevel === 'Admin' &&
        current.status === 'active' &&
        ((input.accessLevel !== undefined && input.accessLevel !== 'Admin') ||
          input.status === 'inactive');

      if (removesActiveAdmin) {
        const activeAdmins = await countActiveAdmins();

        if (activeAdmins <= 1) {
          throw new ValidationError('The last active Admin cannot be demoted or deactivated');
        }
      }

      if (input.jobRoleIds !== undefined) {
        const existingJobRoles = await findExistingJobRoleIds(input.jobRoleIds);

        if (existingJobRoles.length !== input.jobRoleIds.length) {
          throw new ValidationError('One or more selected job roles do not exist');
        }
      }

      const patch: UserProfilePatch = {};

      if (input.name !== undefined) patch.name = input.name;
      if (input.accessLevel !== undefined) patch.accessLevel = input.accessLevel;
      if (input.status !== undefined) patch.status = input.status;
      if (input.jobRoleIds !== undefined) patch.jobRoleIds = input.jobRoleIds;
      if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
      if (input.whatsappNumber !== undefined) patch.whatsappNumber = input.whatsappNumber;

      if (input.whatsappOptIn !== undefined && input.whatsappOptIn !== current.whatsappOptIn) {
        patch.whatsappOptIn = input.whatsappOptIn;
        patch.whatsappOptInAt = input.whatsappOptIn ? new Date().toISOString() : null;
        patch.whatsappOptInSource = input.whatsappOptIn ? 'admin' : null;
      }

      const updated = await updateUserRecord(id, patch);

      if (!updated) {
        throw new NotFoundError('Employee');
      }

      const base = { actorId, entityType: 'user' as const, entityId: id };

      if (
        input.name !== undefined ||
        input.whatsappNumber !== undefined ||
        patch.whatsappOptIn !== undefined
      ) {
        await recordAudit({
          ...base,
          action: 'user.update',
          previousValue: {
            name: current.name,
            whatsappNumber: current.whatsappNumber,
            whatsappOptIn: current.whatsappOptIn,
          },
          newValue: {
            name: updated.name,
            whatsappNumber: updated.whatsappNumber,
            whatsappOptIn: updated.whatsappOptIn,
          },
          notes: null,
        });
      }

      if (input.accessLevel !== undefined && input.accessLevel !== current.accessLevel) {
        await recordAudit({
          ...base,
          action: 'user.access_level.update',
          previousValue: { accessLevel: current.accessLevel },
          newValue: { accessLevel: updated.accessLevel },
          notes: null,
        });
      }

      if (input.jobRoleIds !== undefined) {
        await recordAudit({
          ...base,
          action: 'user.job_roles.update',
          previousValue: { jobRoleIds: current.jobRoleIds },
          newValue: { jobRoleIds: updated.jobRoleIds },
          notes: null,
        });
      }

      if (input.capabilities !== undefined) {
        await recordAudit({
          ...base,
          action: 'user.capabilities.update',
          previousValue: { capabilities: current.capabilities },
          newValue: { capabilities: updated.capabilities },
          notes: null,
        });
      }

      if (input.status !== undefined && input.status !== current.status) {
        await recordAudit({
          ...base,
          action: 'user.status.update',
          previousValue: { status: current.status },
          newValue: { status: updated.status },
          notes: null,
        });
      }

      if (input.status === 'inactive' && current.status !== 'inactive') {
        const revoked = await revokeUserSessions(id);

        await recordAudit({
          ...base,
          action: 'user.sessions.revoke',
          previousValue: null,
          newValue: { revoked },
          notes: 'Revoked on deactivation',
        });
      }

      return profileOf(updated);
    },

    async revokeSessions(actorId, id) {
      await requireRecord(id);

      const revoked = await revokeUserSessions(id);

      await recordAudit({
        actorId,
        action: 'user.sessions.revoke',
        entityType: 'user',
        entityId: id,
        previousValue: null,
        newValue: { revoked },
        notes: null,
      });

      return { revoked };
    },
  };
}
