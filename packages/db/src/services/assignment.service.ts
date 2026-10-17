import type { AssignmentSource } from '@interscale/shared';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { NotFoundError, ValidationError } from '../lib/errors';
import { ClientRoleAssignmentModel } from '../models/client-role-assignment';
import { isActiveClientMember } from './client.service';
import { resolveAssignableEmployee, type EmployeeDirectory } from './employee-directory';
import { assignTaskRecord } from './task.service';

/**
 * Client-specific automatic employee assignment (Step 15).
 *
 * Precedence (docs/00-product-requirements.md §6.1):
 * 1. Explicit template override — Phase 4 hook only; reported as
 *    unresolvable until templates exist (never silently skipped).
 * 2. Client-specific designated PRIMARY employee for the job role.
 * 3. Manual Manager selection (Needs Assignment).
 *
 * Never random, never a silent overwrite: valid manual assignments are
 * preserved, and every automatic assignment records its provenance
 * (`role_mapping`) in the assignment audit payload.
 */

export interface AssignmentServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

export type AssignmentDecision =
  | { action: 'keep' }
  | { action: 'assign'; employeeId: string; source: Extract<AssignmentSource, 'role_mapping'> }
  | { action: 'needs_manager'; reason: string };

export interface ResolveAssigneeInput {
  clientId: string;
  jobRoleId: string | null;
  existingAssigneeId?: string | null;
  /** Phase 4 hook: accepted, never resolved before templates exist. */
  templateOverrideId?: string | null;
  directory: EmployeeDirectory;
}

/**
 * Resolve who should hold a task without overwriting valid manual choices.
 *
 * Eligibility reuses the task-assignment rules (active, holds role, client
 * member). Returns what to do rather than writing anything.
 */
export async function resolveTaskAssignee(
  input: ResolveAssigneeInput,
  options: AssignmentServiceOptions = {},
): Promise<AssignmentDecision> {
  void (options.connection ?? getConnection());

  if (input.templateOverrideId) {
    return {
      action: 'needs_manager',
      reason: 'Template override resolution arrives with Phase 4 templates',
    };
  }

  if (input.existingAssigneeId) {
    const eligible = await isAssigneeEligible(
      input.directory,
      input.clientId,
      input.existingAssigneeId,
      input.jobRoleId,
    );

    if (eligible === null) {
      return { action: 'keep' };
    }

    return {
      action: 'needs_manager',
      reason: `Current assignee is no longer eligible: ${eligible}`,
    };
  }

  if (!input.jobRoleId) {
    return { action: 'needs_manager', reason: 'No functional job role selected for this task' };
  }

  const clientId = assertObjectId(input.clientId, 'client');
  const jobRoleId = assertObjectId(input.jobRoleId, 'job role');

  const designated = await ClientRoleAssignmentModel.findOne({
    clientId,
    jobRoleId,
    isPrimary: true,
    isActive: true,
  })
    .select({ userId: 1 })
    .lean();

  if (!designated) {
    return {
      action: 'needs_manager',
      reason: 'No designated primary employee for this client and job role',
    };
  }

  const candidateId = designated.userId.toString();
  const eligible = await isAssigneeEligible(
    input.directory,
    input.clientId,
    candidateId,
    input.jobRoleId,
  );

  if (eligible !== null) {
    return {
      action: 'needs_manager',
      reason: `Designated employee is no longer eligible: ${eligible}`,
    };
  }

  return { action: 'assign', employeeId: candidateId, source: 'role_mapping' };
}

/** Returns `null` when eligible, otherwise a human-readable cause. */
async function isAssigneeEligible(
  directory: EmployeeDirectory,
  clientId: string,
  userId: string,
  jobRoleId: string | null,
): Promise<string | null> {
  if (!jobRoleId) {
    return 'no functional job role on the task';
  }

  try {
    await resolveAssignableEmployee(directory, userId, jobRoleId);
  } catch (error) {
    return error instanceof Error ? error.message : 'employee is not assignable';
  }

  const member = await isActiveClientMember(clientId, userId);

  if (!member) {
    return 'employee is not an active member of this client team';
  }

  return null;
}

export interface ApplyAssignmentInput {
  taskId: string;
  employeeId: string;
  jobRoleId: string;
  actorId: string | null;
  directory: EmployeeDirectory;
}

/**
 * Apply an automatic assignment (provenance `role_mapping`, audited).
 *
 * The actor is the workflow trigger (or null for system-initiated passes);
 * callers run this inside their transaction via `options.session`.
 */
export async function applyAutoAssignment(
  input: ApplyAssignmentInput,
  options: AssignmentServiceOptions = {},
): Promise<string> {
  void (options.connection ?? getConnection());

  if (!input.actorId) {
    throw new ValidationError('Automatic assignment requires a triggering actor');
  }

  const updated = await assignTaskRecord(
    input.taskId,
    { assignedUserId: input.employeeId, assignedJobRoleId: input.jobRoleId },
    input.actorId,
    { directory: input.directory, session: options.session },
    undefined,
    'role_mapping',
  );

  if (!updated.assignedUserId) {
    throw new NotFoundError('Task');
  }

  return updated.assignedUserId;
}
