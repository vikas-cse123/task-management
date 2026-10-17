import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertParentCanComplete,
  computeTaskProgress,
  createClientRecord,
  createProjectRecord,
  createSubtaskRecord,
  createTaskRecord,
  findTaskDetail,
  listSubtasks,
  subtaskDeadlineWarnings,
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

let roleA = '';
let roleB = '';

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === WRITER || id === EDITOR) {
        return { id, status: 'active', jobRoleIds: [roleA, roleB] };
      }

      return null;
    },
  };
}

async function setupParent() {
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

  for (const user of [WRITER, EDITOR]) {
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

  const parent = await createTaskRecord(
    {
      projectId: project.id,
      parentTaskId: null,
      title: 'Produce Singapore Video Ad',
      description: null,
      assignedUserId: null,
      assignedJobRoleId: null,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      priority: 'high',
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

  return { client, project, parent };
}

function subtaskInput(title: string, assignedUserId: string | null = WRITER) {
  return {
    title,
    description: null,
    assignedUserId,
    assignedJobRoleId: roleA as string | null,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    priority: 'medium' as const,
    approvalRequired: false,
    approverId: null,
    sopUrl: null,
    referenceUrl: null,
    sourceMeetingId: null,
    confirmCompletedParent: false,
    autoAssign: false,
  };
}

describe.skipIf(!hasTestDatabase)('subtask service', () => {
  beforeAll(async () => {
    await connectTestDatabase('subtask_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    const { seedReferenceData } = await import('../src');
    await seedReferenceData();

    const roles = await JobRoleModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean();
    roleA = roles[0]?._id.toString() ?? '';
    roleB = roles[1]?._id.toString() ?? '';
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates real subtasks with independent assignees', async () => {
    const { parent } = await setupParent();

    const script = await createSubtaskRecord(
      parent.id,
      subtaskInput('Write script', WRITER),
      ACTOR,
      {
        directory: stubDirectory(),
      },
    );
    const edit = await createSubtaskRecord(
      parent.id,
      { ...subtaskInput('Edit video', EDITOR), assignedJobRoleId: roleB },
      ACTOR,
      { directory: stubDirectory() },
    );

    expect(script.task.parentTaskId).toBe(parent.id);
    expect(script.task.projectId).toBe(parent.projectId);
    expect(script.task.assignedUserId).toBe(WRITER);
    expect(edit.task.assignedUserId).toBe(EDITOR);
    expect(script.warnings).toEqual([]);

    const children = await listSubtasks(parent.id);
    expect(children).toHaveLength(2);

    const detail = await findTaskDetail(edit.task.id);
    expect(detail?.parent?.id).toBe(parent.id);
    expect(detail?.parent?.title).toBe('Produce Singapore Video Ad');
  });

  it('enforces one-level nesting in the same project', async () => {
    const { parent } = await setupParent();

    const child = await createSubtaskRecord(parent.id, subtaskInput('Child'), ACTOR, {
      directory: stubDirectory(),
    });

    await expect(
      createSubtaskRecord(child.task.id, subtaskInput('Grandchild'), ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createSubtaskRecord(new mongoose.Types.ObjectId().toString(), subtaskInput('Orphan'), ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('warns when a subtask exceeds the parent deadline', async () => {
    const { parent } = await setupParent();

    expect(
      subtaskDeadlineWarnings(
        new Date('2026-10-20T00:00:00.000Z'),
        new Date('2026-10-21T00:00:00.000Z'),
      ),
    ).toHaveLength(1);
    expect(subtaskDeadlineWarnings(new Date('2026-10-20T00:00:00.000Z'), null)).toEqual([]);

    const late = await createSubtaskRecord(
      parent.id,
      {
        ...subtaskInput('Late child'),
        dueAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    expect(late.warnings).toHaveLength(1);
    expect(late.task.id).toBeTruthy();
  });

  it('computes progress and guards parent completion', async () => {
    const { parent } = await setupParent();

    await assertParentCanComplete(parent.id);

    const first = await createSubtaskRecord(parent.id, subtaskInput('One'), ACTOR, {
      directory: stubDirectory(),
    });
    await createSubtaskRecord(parent.id, subtaskInput('Two'), ACTOR, {
      directory: stubDirectory(),
    });

    // Flip one child to done directly at the collection level (the status
    // engine that performs this transition lands in Step 10).
    await mongoose.connection
      .collection('tasks')
      .updateOne({ _id: new mongoose.Types.ObjectId(first.task.id) }, { $set: { status: 'done' } });

    expect(await computeTaskProgress(parent.id)).toEqual({ total: 2, completed: 1, percent: 50 });

    await expect(assertParentCanComplete(parent.id)).rejects.toBeInstanceOf(ValidationError);

    await mongoose.connection
      .collection('tasks')
      .updateMany(
        { parentTaskId: new mongoose.Types.ObjectId(parent.id) },
        { $set: { status: 'done' } },
      );

    await assertParentCanComplete(parent.id);
    expect(await computeTaskProgress(parent.id)).toEqual({ total: 2, completed: 2, percent: 100 });
  });
});
