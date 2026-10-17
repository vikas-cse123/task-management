import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findExistingJobRoleIds,
  listDepartments,
  listJobRoles,
  seedReferenceData,
  updateDepartment,
  updateJobRole,
  NotFoundError,
  ValidationError,
} from '../src';
import { connectTestDatabase, disconnectTestDatabase, ensureIndexes } from './support/database';
import { hasTestDatabase } from './support/flags';

describe.skipIf(!hasTestDatabase)('reference data service', () => {
  beforeAll(async () => {
    await connectTestDatabase('reference_service');
    await ensureIndexes();
    await seedReferenceData();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('lists seeded departments and job roles', async () => {
    const departments = await listDepartments();
    const jobRoles = await listJobRoles();

    expect(departments).toHaveLength(4);
    expect(jobRoles).toHaveLength(6);
    expect(jobRoles.every((role) => mongoose.isValidObjectId(role.departmentId))).toBe(true);
  });

  it('resolves existing job-role ids only', async () => {
    const [role] = await listJobRoles();
    const missing = new mongoose.Types.ObjectId().toString();

    const existing = await findExistingJobRoleIds([role?.id ?? '', missing]);
    expect(existing).toEqual([role?.id]);
  });

  it('rejects malformed job-role ids', async () => {
    await expect(findExistingJobRoleIds(['nope'])).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates a department display name', async () => {
    const [department] = await listDepartments();

    const updated = await updateDepartment(department?.id ?? '', { name: 'Creative Ops' });
    expect(updated.name).toBe('Creative Ops');
    expect(updated.key).toBe(department?.key);
  });

  it('updates a job role description', async () => {
    const [role] = await listJobRoles();

    const updated = await updateJobRole(role?.id ?? '', { description: 'Writes ad scripts' });
    expect(updated.description).toBe('Writes ad scripts');
  });

  it('reports a missing department', async () => {
    await expect(
      updateDepartment(new mongoose.Types.ObjectId().toString(), { name: 'Ghost' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
