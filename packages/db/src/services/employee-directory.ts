import { isValidObjectId, type UserStatus } from '@interscale/shared';
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
