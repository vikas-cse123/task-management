import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DepartmentModel, JobRoleModel, seedReferenceData } from '../src';
import { connectTestDatabase, disconnectTestDatabase, ensureIndexes } from './support/database';
import { hasTestDatabase } from './support/flags';

describe.skipIf(!hasTestDatabase)('reference data seeding', () => {
  beforeAll(async () => {
    await connectTestDatabase('reference');
    await ensureIndexes();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('seeds four departments and six job roles linked to departments', async () => {
    const summary = await seedReferenceData();
    expect(summary).toEqual({ departments: 4, jobRoles: 6 });

    const departments = await DepartmentModel.find().lean();
    expect(departments).toHaveLength(4);

    const jobRoles = await JobRoleModel.find().lean();
    expect(jobRoles).toHaveLength(6);

    const departmentIdByKey = new Map(
      departments.map((department) => [department.key, department._id.toString()]),
    );
    const marketer = jobRoles.find((jobRole) => jobRole.key === 'performance_marketer');

    expect(marketer?.departmentId.toString()).toBe(departmentIdByKey.get('performance_marketing'));
  });

  it('is idempotent and preserves stable identifiers and admin edits', async () => {
    const before = await DepartmentModel.find().lean();
    const beforeIds = before.map((department) => department._id.toString()).sort();

    await DepartmentModel.updateOne({ key: 'creative_production' }, { $set: { name: 'Creative' } });

    const summary = await seedReferenceData();
    expect(summary).toEqual({ departments: 4, jobRoles: 6 });

    const after = await DepartmentModel.find().lean();
    expect(after.map((department) => department._id.toString()).sort()).toEqual(beforeIds);

    const edited = after.find((department) => department.key === 'creative_production');
    expect(edited?.name).toBe('Creative');
  });

  it('enforces the unique department key', async () => {
    await expect(
      DepartmentModel.create({ key: 'creative_production', name: 'Duplicate Department' }),
    ).rejects.toThrow();
  });
});
