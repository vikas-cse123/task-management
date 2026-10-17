import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createClientRecord,
  createProjectRecord,
  createTaskRecord,
  getDashboardSummary,
  seedReferenceData,
  startTask,
  submitTask,
  upsertClientTeamMember,
  JobRoleModel,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase, hasTransactions } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const MANAGER = new mongoose.Types.ObjectId().toString();
const EMPLOYEE = new mongoose.Types.ObjectId().toString();

let roleA = '';

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if ([MANAGER, EMPLOYEE].includes(id)) {
        return { id, status: 'active', jobRoleIds: [roleA] };
      }

      return null;
    },
  };
}

describe.skipIf(!hasTestDatabase || !hasTransactions)('dashboard service', () => {
  beforeAll(async () => {
    await connectTestDatabase('dashboard_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await seedReferenceData();

    const roles = await JobRoleModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean();
    roleA = roles[0]?._id.toString() ?? '';
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('scopes every figure by role without leaking', async () => {
    const client = await createClientRecord({ name: 'Travel Enfield', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });
    const other = await createClientRecord({ name: 'Elsewhere', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    const project = await createProjectRecord(
      {
        clientId: client.id,
        name: 'Singapore Campaign',
        description: null,
        type: 'campaign',
        status: 'planned',
        managerId: null,
        startAt: null,
        targetAt: null,
      },
      ACTOR,
      { directory: stubDirectory() },
    );
    await createProjectRecord(
      {
        clientId: other.id,
        name: 'Hidden Campaign',
        description: null,
        type: 'campaign',
        status: 'planned',
        managerId: null,
        startAt: null,
        targetAt: null,
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    await upsertClientTeamMember(
      ACTOR,
      client.id,
      MANAGER,
      { isActive: true },
      {
        directory: stubDirectory(),
      },
    );
    await upsertClientTeamMember(
      ACTOR,
      client.id,
      EMPLOYEE,
      { isActive: true },
      {
        directory: stubDirectory(),
      },
    );

    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    const overdue = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Late work',
        description: null,
        assignedUserId: EMPLOYEE,
        assignedJobRoleId: roleA,
        dueAt: past,
        priority: 'urgent',
        approvalRequired: false,
        approverId: null,
        sopUrl: null,
        referenceUrl: null,
        sourceMeetingId: null,
        confirmCompletedParent: false,
        autoAssign: false,
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    const pending = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Needs review',
        description: null,
        assignedUserId: EMPLOYEE,
        assignedJobRoleId: roleA,
        dueAt: future,
        priority: 'high',
        approvalRequired: true,
        approverId: MANAGER,
        sopUrl: null,
        referenceUrl: null,
        sourceMeetingId: null,
        confirmCompletedParent: false,
        autoAssign: false,
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    await startTask(overdue.id, EMPLOYEE);
    await startTask(pending.id, EMPLOYEE);
    await submitTask(pending.id, EMPLOYEE);

    const admin = await getDashboardSummary(ACTOR, 'Admin');
    expect(admin.clients).toEqual({ total: 2, active: 2, withoutManager: 2 });
    expect(admin.projects).toEqual({ total: 2, open: 2 });
    expect(admin.tasks.overdue).toBe(1);
    expect(admin.tasks.awaitingApproval).toBe(1);
    expect(admin.approvalsPending).toBe(0);
    expect(admin.myWork.total).toBe(0);

    const manager = await getDashboardSummary(MANAGER, 'Manager');
    expect(manager.clients.total).toBe(1);
    expect(manager.projects.total).toBe(1);
    expect(manager.tasks.total).toBe(2);
    expect(manager.approvalsPending).toBe(1);
    expect(manager.workloadByEmployee.length).toBeGreaterThan(0);

    const employee = await getDashboardSummary(EMPLOYEE, 'Employee');
    expect(employee.tasks.total).toBe(2);
    expect(employee.myWork.overdue).toBe(1);
    expect(employee.myWork.awaitingApproval).toBe(1);
    expect(employee.approvalsPending).toBe(0);
    expect(employee.projects.total).toBe(1);
    expect(employee.clients.total).toBe(1);
  });
});
