import { CLIENT_TEAM_ROLES, type ClientTeamRole } from '@interscale/shared';
import type { ClientSession, Connection } from 'mongoose';
import { withTransaction } from '../connection';
import { NotFoundError, ValidationError } from '../lib/errors';
import { assertObjectId } from '../lib/object-id';
import { AuditLogModel } from '../models/audit-log';
import { ClientModel } from '../models/client';
import { ClientRoleAssignmentModel } from '../models/client-role-assignment';
import { ClientTeamMemberModel } from '../models/client-team-member';
import { JobRoleModel } from '../models/job-role';
import { resolveAssignableEmployee, type EmployeeDirectory } from './employee-directory';

const DEFAULT_TEAM_ROLE: ClientTeamRole = CLIENT_TEAM_ROLES[1];

export interface ClientRoleAssignmentDeps {
  /** Employee lookup used to validate assignable users. */
  directory: EmployeeDirectory;
  /** Connection override; defaults to the global Mongoose connection. */
  connection?: Connection;
}

export interface AssignClientRoleInput {
  clientId: string;
  jobRoleId: string;
  userId: string;
  /** When true, makes this the single active primary designated employee. */
  isPrimary?: boolean;
  actorId?: string | null;
}

export interface ClientRoleAssignmentResult {
  assignmentId: string;
  membershipId: string;
  clientId: string;
  jobRoleId: string;
  userId: string;
  isPrimary: boolean;
  isActive: boolean;
}

async function assertReferencesExist(
  session: ClientSession,
  clientId: string,
  jobRoleId: string,
): Promise<void> {
  const client = await ClientModel.findById(clientId).session(session);
  if (!client) {
    throw new NotFoundError('Client');
  }

  const jobRole = await JobRoleModel.findById(jobRoleId).session(session);
  if (!jobRole) {
    throw new NotFoundError('Job role');
  }
}

/**
 * Designate an employee for a client/job-role.
 *
 * Performs, atomically (docs/04-data-model.md):
 * 1. validate that the client and job role exist;
 * 2. validate that the employee exists, is active and holds the job role;
 * 3. ensure an active client team membership (created if missing);
 * 4. demote any other active primary for the same client/role and mark this
 *    assignment active (and primary when requested);
 * 5. record a sanitized audit entry.
 *
 * If any step fails, every write is rolled back by the surrounding transaction.
 */
export async function assignClientRole(
  input: AssignClientRoleInput,
  deps: ClientRoleAssignmentDeps,
): Promise<ClientRoleAssignmentResult> {
  const clientId = assertObjectId(input.clientId, 'client');
  const jobRoleId = assertObjectId(input.jobRoleId, 'job role');
  const userId = assertObjectId(input.userId, 'employee');
  const isPrimary = input.isPrimary ?? false;

  return withTransaction(
    async (session) => {
      await assertReferencesExist(session, clientId, jobRoleId);
      await resolveAssignableEmployee(deps.directory, userId, jobRoleId);

      const membership = await ClientTeamMemberModel.findOneAndUpdate(
        { clientId, userId },
        { $set: { isActive: true }, $setOnInsert: { roleInTeam: DEFAULT_TEAM_ROLE } },
        { upsert: true, returnDocument: 'after', session },
      );

      if (!membership) {
        throw new ValidationError('Failed to create client team membership');
      }

      if (isPrimary) {
        await ClientRoleAssignmentModel.updateMany(
          { clientId, jobRoleId, isActive: true, isPrimary: true, userId: { $ne: userId } },
          { $set: { isPrimary: false } },
          { session },
        );
      }

      const assignment = await ClientRoleAssignmentModel.findOneAndUpdate(
        { clientId, jobRoleId, userId },
        { $set: { isActive: true, isPrimary } },
        { upsert: true, returnDocument: 'after', session },
      );

      if (!assignment) {
        throw new ValidationError('Failed to create client role assignment');
      }

      await AuditLogModel.create(
        [
          {
            actorId: input.actorId ?? null,
            action: 'client.role.assign',
            entityType: 'client_role_assignment',
            entityId: assignment._id,
            previousValue: null,
            newValue: { clientId, jobRoleId, userId, isPrimary, isActive: true },
            notes: null,
          },
        ],
        { session },
      );

      return {
        assignmentId: assignment._id.toString(),
        membershipId: membership._id.toString(),
        clientId,
        jobRoleId,
        userId,
        isPrimary: assignment.isPrimary,
        isActive: assignment.isActive,
      };
    },
    deps.connection ? { connection: deps.connection } : {},
  );
}

export interface RemoveClientRoleInput {
  clientId: string;
  jobRoleId: string;
  userId: string;
  actorId?: string | null;
}

/**
 * Revoke a designated client/job-role assignment.
 *
 * The client team membership is intentionally left intact: a user may be a team
 * member through other roles, and membership records are deactivated rather
 * than deleted.
 */
export async function removeClientRole(
  input: RemoveClientRoleInput,
  deps: ClientRoleAssignmentDeps,
): Promise<ClientRoleAssignmentResult> {
  const clientId = assertObjectId(input.clientId, 'client');
  const jobRoleId = assertObjectId(input.jobRoleId, 'job role');
  const userId = assertObjectId(input.userId, 'employee');

  return withTransaction(
    async (session) => {
      const assignment = await ClientRoleAssignmentModel.findOne({
        clientId,
        jobRoleId,
        userId,
      }).session(session);

      if (!assignment) {
        throw new NotFoundError('Client role assignment');
      }

      const membership = await ClientTeamMemberModel.findOne({ clientId, userId }).session(session);
      if (!membership) {
        throw new ValidationError('Client team membership is missing for this assignment');
      }

      const previous = { isPrimary: assignment.isPrimary, isActive: assignment.isActive };

      assignment.isPrimary = false;
      assignment.isActive = false;
      await assignment.save({ session });

      await AuditLogModel.create(
        [
          {
            actorId: input.actorId ?? null,
            action: 'client.role.remove',
            entityType: 'client_role_assignment',
            entityId: assignment._id,
            previousValue: previous,
            newValue: { isPrimary: false, isActive: false },
            notes: null,
          },
        ],
        { session },
      );

      return {
        assignmentId: assignment._id.toString(),
        membershipId: membership._id.toString(),
        clientId,
        jobRoleId,
        userId,
        isPrimary: assignment.isPrimary,
        isActive: assignment.isActive,
      };
    },
    deps.connection ? { connection: deps.connection } : {},
  );
}
