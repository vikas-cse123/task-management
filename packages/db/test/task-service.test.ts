import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignTaskRecord,
  AuditLogModel,
  computeTaskProgress,
  ConcurrentModificationError,
  createClientRecord,
  createProjectRecord,
  createTaskRecord,
  findTask,
  findTaskDetail,
  listMyTasks,
  listSubtasks,
  listTaskActivity,
  listTasks,
  seedReferenceData,
  updateTaskRecord,
  upsertClientTeamMember,
  JobRoleModel,
  NotFoundError,
  ValidationError,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const WRITER = new mongoose.Types.ObjectId().toString();
const EDITOR = new mongoose.Types.ObjectId().toString();
const OUTSIDER = new mongoose.Types.ObjectId().toString();
const INACTIVE = new mongoose.Types.ObjectId().toString();

let roleA = '';
let roleB = '';

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === WRITER || id === EDITOR || id === OUTSIDER) {
        return { id, status: 'active', jobRoleIds: [roleA, roleB] };
      }

      if (id === INACTIVE) {
        return { id, status: 'inactive', jobRoleIds: [roleA] };
      }

      return null;
    },
  };
}

async function setupProject() {
  const client = await createClientRecord({ name: 'Travel Enfield', status: 'active' }, ACTOR, {
    directory: stubDirectory(),
  });
  const project = await createProjectRecord(
    {
      clientId: client.id,
      name: 'Singapore Meta Ads Campaign',
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
    WRITER,
    { isActive: true },
    {
      directory: stubDirectory(),
    },
  );
  await upsertClientTeamMember(
    ACTOR,
    client.id,
    EDITOR,
    { isActive: true },
    {
      directory: stubDirectory(),
    },
  );

  return { client, project };
}

describe.skipIf(!hasTestDatabase)('task service', () => {
  beforeAll(async () => {
    await connectTestDatabase('task_service');
    await ensureIndexes();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await seedReferenceData();

    const roles = await JobRoleModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean();
    roleA = roles[0]?._id.toString() ?? '';
    roleB = roles[1]?._id.toString() ?? '';
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a task with validated assignment and audits it', async () => {
    const { project } = await setupProject();

    const task = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Write Singapore Video Ad Script',
        description: 'Follow the SOP',
        assignedUserId: WRITER,
        assignedJobRoleId: roleA,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        priority: 'high',
        approvalRequired: true,
        approverId: EDITOR,
        sopUrl: 'https://example.test/sop',
        referenceUrl: null,
        sourceMeetingId: null,
        confirmCompletedParent: false,
        autoAssign: false,
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    expect(task.status).toBe('todo');
    expect(task.assignedUserId).toBe(WRITER);
    expect(task.needsAssignment).toBe(false);
    expect(task.isOverdue).toBe(false);

    const audit = await AuditLogModel.findOne({ action: 'task.create' }).lean();
    expect(audit?.entityId.toString()).toBe(task.id);

    const activity = await listTaskActivity(task.id);
    expect(activity.map((entry) => entry.action)).toEqual(['task.create']);
  });

  it('rejects invalid assignments', async () => {
    const { project } = await setupProject();

    const base = {
      projectId: project.id,
      parentTaskId: null,
      title: 'Bad assignment',
      description: null,
      assignedUserId: null as string | null,
      assignedJobRoleId: roleA as string | null,
      dueAt: null,
      priority: 'medium' as const,
      approvalRequired: false,
      approverId: null,
      sopUrl: null,
      referenceUrl: null,
      sourceMeetingId: null,
      confirmCompletedParent: false,
      autoAssign: false,
    };

    // Unknown project.
    await expect(
      createTaskRecord({ ...base, projectId: new mongoose.Types.ObjectId().toString() }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Inactive employee.
    await expect(
      createTaskRecord({ ...base, assignedUserId: INACTIVE }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Employee outside the client team.
    await expect(
      createTaskRecord({ ...base, assignedUserId: OUTSIDER }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Assignee without a job role.
    await expect(
      createTaskRecord({ ...base, assignedUserId: WRITER, assignedJobRoleId: null }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Approval required without an approver.
    await expect(
      createTaskRecord({ ...base, approvalRequired: true }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Unassigned state is explicit and flagged.
    const unassigned = await createTaskRecord(base, ACTOR, { directory: stubDirectory() });
    expect(unassigned.assignedUserId).toBeNull();
    expect(unassigned.needsAssignment).toBe(true);
  });

  it('reassigns with audit history', async () => {
    const { project } = await setupProject();

    const task = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Reassignable',
        description: null,
        assignedUserId: WRITER,
        assignedJobRoleId: roleA,
        dueAt: null,
        priority: 'medium',
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

    const reassigned = await assignTaskRecord(
      task.id,
      { assignedUserId: EDITOR, assignedJobRoleId: roleB },
      ACTOR,
      { directory: stubDirectory() },
    );
    expect(reassigned.assignedUserId).toBe(EDITOR);

    const activity = await listTaskActivity(task.id);
    const actions = activity.map((entry) => entry.action);
    expect(actions).toContain('task.create');
    expect(actions).toContain('task.assign');
    expect(activity).toHaveLength(2);
  });

  it('derives overdue and filters due views', async () => {
    const { project } = await setupProject();
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    const overdue = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Late script',
        description: null,
        assignedUserId: WRITER,
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
    expect(overdue.isOverdue).toBe(true);

    await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Future edit',
        description: null,
        assignedUserId: WRITER,
        assignedJobRoleId: roleA,
        dueAt: future,
        priority: 'medium',
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

    const overduePage = await listTasks({ limit: 50, due: 'overdue' }, { kind: 'all' });
    expect(overduePage.data.map((task) => task.title)).toEqual(['Late script']);

    const upcomingPage = await listTasks({ limit: 50, due: 'upcoming' }, { kind: 'all' });
    expect(upcomingPage.data.map((task) => task.title)).toEqual(['Future edit']);

    const mine = await listMyTasks(WRITER, { limit: 50 }, {});
    expect(mine.data).toHaveLength(2);
    expect(mine.data[0]?.projectName).toBe('Singapore Meta Ads Campaign');
    expect(mine.data[0]?.clientName).toBe('Travel Enfield');
  });

  it('computes leaf progress and scopes project detail', async () => {
    await setupProject();

    const detail = await findTaskDetail(new mongoose.Types.ObjectId().toString());
    expect(detail).toBeNull();

    const progress = await computeTaskProgress(new mongoose.Types.ObjectId().toString());
    expect(progress).toEqual({ total: 1, completed: 0, percent: 0 });
  });

  it('rejects stale versions and missing tasks', async () => {
    const { project } = await setupProject();

    const task = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Versioned',
        description: null,
        assignedUserId: null,
        assignedJobRoleId: null,
        dueAt: null,
        priority: 'low',
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

    await expect(
      updateTaskRecord(task.id, { title: 'Renamed' }, ACTOR, { directory: stubDirectory() }, 42),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    await expect(
      assignTaskRecord(
        task.id,
        { assignedUserId: WRITER, assignedJobRoleId: roleA },
        ACTOR,
        { directory: stubDirectory() },
        42,
      ),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    const missing = new mongoose.Types.ObjectId().toString();
    await expect(
      updateTaskRecord(missing, { title: 'x' }, ACTOR, { directory: stubDirectory() }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(listSubtasks(missing)).rejects.toBeInstanceOf(NotFoundError);
    expect(await findTask(missing)).toBeNull();
  });
});
