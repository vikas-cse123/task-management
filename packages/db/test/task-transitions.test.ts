import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveTask,
  AuditLogModel,
  blockTask,
  cancelTask,
  completeTask,
  createClientRecord,
  createProjectRecord,
  createSubtaskRecord,
  createTaskRecord,
  listTaskActivity,
  reopenTask,
  reviseTask,
  startTask,
  submitTask,
  unblockTask,
  upsertClientTeamMember,
  JobRoleModel,
  seedReferenceData,
  ConcurrentModificationError,
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
import { hasTestDatabase, hasTransactions } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const WRITER = new mongoose.Types.ObjectId().toString();
const APPROVER = new mongoose.Types.ObjectId().toString();

let roleA = '';
let setupCounter = 0;

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === WRITER || id === APPROVER) {
        return { id, status: 'active', jobRoleIds: [roleA] };
      }

      return null;
    },
  };
}

async function setupTask(overrides: Record<string, unknown> = {}) {
  setupCounter += 1;
  const client = await createClientRecord(
    { name: `Travel Enfield ${setupCounter}`, status: 'active' },
    ACTOR,
    {
      directory: stubDirectory(),
    },
  );
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

  for (const user of [WRITER, APPROVER]) {
    await upsertClientTeamMember(
      ACTOR,
      client.id,
      user,
      { isActive: true },
      {
        directory: stubDirectory(),
      },
    );
  }

  const task = await createTaskRecord(
    {
      projectId: project.id,
      parentTaskId: null,
      title: 'Write script',
      description: null,
      assignedUserId: WRITER,
      assignedJobRoleId: roleA,
      dueAt: null,
      priority: 'medium',
      approvalRequired: true,
      approverId: APPROVER,
      sopUrl: null,
      referenceUrl: null,
      sourceMeetingId: null,
      confirmCompletedParent: false,
      autoAssign: false,
      ...overrides,
    },
    ACTOR,
    { directory: stubDirectory() },
  );

  return { client, project, task };
}

describe.skipIf(!hasTestDatabase || !hasTransactions)('task transitions (transactional)', () => {
  beforeAll(async () => {
    await connectTestDatabase('task_transitions');
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

  it('runs the full approval flow', async () => {
    const { task } = await setupTask();

    expect((await startTask(task.id, WRITER)).status).toBe('in_progress');
    expect((await submitTask(task.id, WRITER)).status).toBe('awaiting_approval');

    const approved = await approveTask(task.id, APPROVER, { note: 'Looks good' });
    expect(approved.status).toBe('done');
    expect(approved.completedAt).not.toBeNull();
    expect(approved.approvedBy).toBe(APPROVER);

    const actions = (await listTaskActivity(task.id)).map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining(['task.create', 'task.status.update', 'task.submit', 'task.approve']),
    );
  });

  it('rejects invalid transitions and unauthorized approvers', async () => {
    const { task } = await setupTask();

    // Blocked cannot start; terminal states are guarded.
    await blockTask(task.id, WRITER, 'Waiting on brief');
    await expect(startTask(task.id, WRITER)).rejects.toBeInstanceOf(ValidationError);
    await unblockTask(task.id, WRITER, 'Brief arrived');

    // Only the designated approver, and never the assignee.
    await startTask(task.id, WRITER);
    await submitTask(task.id, WRITER);
    await expect(approveTask(task.id, WRITER)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      approveTask(task.id, new mongoose.Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(ValidationError);

    // Revision needs a reason and returns work to progress.
    await expect(reviseTask(task.id, APPROVER, '  ')).rejects.toBeInstanceOf(ValidationError);
    const revised = await reviseTask(task.id, APPROVER, 'Stronger opening needed');
    expect(revised.status).toBe('in_progress');
    expect(revised.revisionCount).toBe(1);

    // Resubmission works after revision.
    await submitTask(task.id, WRITER);
    await approveTask(task.id, APPROVER);
  });

  it('completes no-approval work and protects cancelled tasks', async () => {
    const { task } = await setupTask({ approvalRequired: false, approverId: null });

    await expect(submitTask(task.id, WRITER)).rejects.toBeInstanceOf(ValidationError);

    await startTask(task.id, WRITER);
    const done = await completeTask(task.id, WRITER);
    expect(done.status).toBe('done');

    await expect(cancelTask(task.id, WRITER, 'too late')).rejects.toBeInstanceOf(ValidationError);

    const second = await setupTask({ approvalRequired: false, approverId: null });
    await cancelTask(second.task.id, ACTOR, 'Duplicate');
    await expect(startTask(second.task.id, WRITER)).rejects.toBeInstanceOf(ValidationError);
  });

  it('reopens with authorization state reset', async () => {
    const { task } = await setupTask({ approvalRequired: false, approverId: null });

    await startTask(task.id, WRITER);
    await completeTask(task.id, WRITER);

    await expect(reopenTask(task.id, WRITER, '')).rejects.toBeInstanceOf(ValidationError);

    const reopened = await reopenTask(task.id, ACTOR, 'Client asked for changes');
    expect(reopened.status).toBe('in_progress');
    expect(reopened.completedAt).toBeNull();

    const actions = (await listTaskActivity(task.id)).map((entry) => entry.action);
    expect(actions).toContain('task.reopen');
  });

  it('blocks parent completion while children are unfinished', async () => {
    const { task } = await setupTask({ approvalRequired: false, approverId: null });

    await createSubtaskRecord(
      task.id,
      {
        title: 'Child one',
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

    await startTask(task.id, WRITER);
    await expect(completeTask(task.id, WRITER)).rejects.toBeInstanceOf(ValidationError);
  });

  it('serializes concurrent approvals without duplicates', async () => {
    const { task } = await setupTask();

    await startTask(task.id, WRITER);
    await submitTask(task.id, WRITER);

    const results = await Promise.allSettled([
      approveTask(task.id, APPROVER),
      approveTask(task.id, APPROVER),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason instanceof ConcurrentModificationError || reason instanceof ValidationError).toBe(
      true,
    );

    const approvals = await AuditLogModel.countDocuments({ action: 'task.approve' });
    expect(approvals).toBe(1);
  });

  it('reports missing tasks', async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    await expect(startTask(missing, WRITER)).rejects.toBeInstanceOf(NotFoundError);
  });
});
