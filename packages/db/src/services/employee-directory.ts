import { isValidObjectId, type UserStatus } from '@interscale/shared';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { NotFoundError, ValidationError } from '../lib/errors';

/**
 * Minimal view of a user needed to validate a designated assignment.
 *
 * Access levels are deliberately absent: this is about whether a user may be
 * assigned work, not about what they may access.
 */
export interface EmployeeSnapshot {
  readonly id: string;
  readonly status: UserStatus;
  readonly jobRoleIds: readonly string[];
}

/**
 * Read-only lookup of employees.
 *
 * The user store is owned by Better Auth (docs/adr/0004). The concrete,
 * database-backed implementation is bound when authentication and employee
 * management are implemented in the next step, at which point the identity
 * decision is final. Until then, services accept the interface so the rules can
 * be implemented and tested without duplicating identity.
 */
export interface EmployeeDirectory {
  findById(id: string): Promise<EmployeeSnapshot | null>;
}

/**
 * Resolve an employee and assert they are eligible to be a designated assignee.
 *
 * Rules (docs/03-authorization.md §8, §6):
 * - the employee must exist;
 * - the employee must be active;
 * - the employee must hold the corresponding functional job role.
 */
export async function resolveAssignableEmployee(
  directory: EmployeeDirectory,
  userId: string,
  jobRoleId: string,
): Promise<EmployeeSnapshot> {
  if (!isValidObjectId(userId)) {
    throw new ValidationError('A valid employee identifier is required');
  }

  if (!isValidObjectId(jobRoleId)) {
    throw new ValidationError('A valid job role identifier is required');
  }

  const employee = await directory.findById(userId);

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.status !== 'active') {
    throw new ValidationError('The designated employee is not active');
  }

  if (!employee.jobRoleIds.includes(jobRoleId)) {
    throw new ValidationError('The designated employee does not hold the required job role');
  }

  return employee;
}

/** Raw shape of the fields read from the Better Auth `user` collection. */
interface RawUserDocument {
  _id: mongoose.Types.ObjectId;
  status?: unknown;
  jobRoleIds?: unknown;
}

/**
 * Database-backed {@link EmployeeDirectory}.
 *
 * Reads employee attributes directly from the Better Auth `user` collection
 * (identity is owned by Better Auth; see ADR 0004). Only existence, active
 * status and held job-role ids are read, so no authentication data is exposed.
 */
export class MongoEmployeeDirectory implements EmployeeDirectory {
  constructor(private readonly connection?: Connection) {}

  async findById(id: string): Promise<EmployeeSnapshot | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const connection = this.connection ?? getConnection();
    const document = await connection
      .collection<RawUserDocument>(BETTER_AUTH_USER_COLLECTION)
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!document) {
      return null;
    }

    return {
      id,
      status: document.status === 'inactive' ? 'inactive' : 'active',
      jobRoleIds: Array.isArray(document.jobRoleIds) ? document.jobRoleIds.map(String) : [],
    };
  }
}
