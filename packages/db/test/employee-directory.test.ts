import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError, assertObjectId, resolveAssignableEmployee } from '../src';
import { InMemoryEmployeeDirectory } from './support/in-memory-employee-directory';

const ACTIVE_USER = '507f1f77bcf86cd799439011';
const INACTIVE_USER = '507f1f77bcf86cd799439012';
const NO_ROLE_USER = '507f1f77bcf86cd799439013';
const UNKNOWN_USER = '507f1f77bcf86cd7994390ff';
const JOB_ROLE = '507f1f77bcf86cd799439014';
const OTHER_JOB_ROLE = '507f1f77bcf86cd799439015';

function buildDirectory(): InMemoryEmployeeDirectory {
  return new InMemoryEmployeeDirectory()
    .add({ id: ACTIVE_USER, status: 'active', jobRoleIds: [JOB_ROLE] })
    .add({ id: INACTIVE_USER, status: 'inactive', jobRoleIds: [JOB_ROLE] })
    .add({ id: NO_ROLE_USER, status: 'active', jobRoleIds: [OTHER_JOB_ROLE] });
}

describe('assignable employee resolution', () => {
  it('returns an active employee holding the required role', async () => {
    const employee = await resolveAssignableEmployee(buildDirectory(), ACTIVE_USER, JOB_ROLE);
    expect(employee.id).toBe(ACTIVE_USER);
  });

  it('rejects an unknown employee', async () => {
    await expect(
      resolveAssignableEmployee(buildDirectory(), UNKNOWN_USER, JOB_ROLE),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an inactive employee', async () => {
    await expect(
      resolveAssignableEmployee(buildDirectory(), INACTIVE_USER, JOB_ROLE),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an employee that does not hold the required role', async () => {
    await expect(
      resolveAssignableEmployee(buildDirectory(), NO_ROLE_USER, JOB_ROLE),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects malformed identifiers before any lookup', async () => {
    await expect(
      resolveAssignableEmployee(buildDirectory(), 'nope', JOB_ROLE),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      resolveAssignableEmployee(buildDirectory(), ACTIVE_USER, 'nope'),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('assertObjectId', () => {
  it('accepts a valid identifier', () => {
    expect(assertObjectId(ACTIVE_USER, 'employee')).toBe(ACTIVE_USER);
  });

  it('rejects an invalid identifier with a labelled message', () => {
    expect(() => assertObjectId('bad', 'client')).toThrow(/valid client identifier/i);
  });
});
