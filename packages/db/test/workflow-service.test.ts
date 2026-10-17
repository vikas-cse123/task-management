import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDependency,
  approveTask,
  AuditLogModel,
  blockTask,
  ClientRoleAssignmentModel,
  completeTask,
  createClientRecord,
  createProjectRecord,
  createTaskRecord,
  evaluatePrerequisites,
  evaluateSuccessors,
  getBlockers,
  listMyTasks,
  recordReadyEvent,
  reevaluateTask,
  startTask,
  submitTask,
  unblockTask,
  upsertClientTeamMember,
  WorkflowEventModel,
  JobRoleModel,
  seedReferenceData,
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
const APPROVER = new mongoose.Types.ObjectId().toString();
const WRITER = new mongoose.Types.ObjectId().toString();
const EDITOR = new mongoose.Types.ObjectId().toString();

let roleA = '';
let roleB = '';
let activeIds = [WRITER, EDITOR, APPROVER];

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (activeIds.includes(id)) {
        return { id, status: 'active', jobRoleIds: [roleA, roleB] };
      }

      return null;
    },
  };
}

async function setupGraph() {
  const client = await createClientRecord({ name: 'Travel Enfield', status: 'active' }, ACTOR, {
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

  for (const user of [WRITER, EDITOR, APPROVER]) {
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

  return { client, project };
}

async function createWork(
  projectId: string,
  title: string,
  overrides: Record<string, unknown> = {},
) {
  return createTaskRecord(
    {
      projectId,
      parentTaskId: null,
      title,
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
      ...overrides,
    },
    ACTOR,
    { directory: stubDirectory() },
  );
}

describe.skipIf(!hasTestDatabase || !hasTransactions)('workflow service', () => {
  beforeAll(async () => {
    await connectTestDatabase('workflow_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await seedReferenceData();
    activeIds = [WRITER, EDITOR, APPROVER];

    const roles = await JobRoleModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean();
    roleA = roles[0]?._id.toString() ?? '';
    roleB = roles[1]?._id.toString() ?? '';
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('unlocks dependents on approval with a single readiness event', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief', {
      approvalRequired: true,
      approverId: APPROVER,
    });
    const script = await createWork(project.id, 'Script');

    await addDependency({ predecessorId: brief.id, successorId: script.id, actorId: ACTOR });

    let status = (
      await mongoose.connection
        .collection('tasks')
        .findOne({ _id: new mongoose.Types.ObjectId(script.id) })
    )?.status;
    expect(status).toBe('blocked');

    await startTask(brief.id, WRITER);
    await submitTask(brief.id, WRITER);

    // Submission alone never unlocks.
    status = (
      await mongoose.connection
        .collection('tasks')
        .findOne({ _id: new mongoose.Types.ObjectId(script.id) })
    )?.status;
    expect(status).toBe('blocked');

    await approveTask(brief.id, APPROVER);

    const unlocked = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(script.id) });
    expect(unlocked?.status).toBe('todo');

    expect(await WorkflowEventModel.countDocuments({ taskId: script.id })).toBe(1);

    // Idempotent: reevaluating a ready task records nothing new.
    await reevaluateTask(script.id, { actorId: ACTOR, directory: stubDirectory() });
    expect(await WorkflowEventModel.countDocuments({ taskId: script.id })).toBe(1);

    const evaluation = await evaluatePrerequisites(script.id);
    expect(evaluation.satisfied).toBe(true);
  });

  it('unlocks on no-approval completion and fans out to every successor', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief');
    const script = await createWork(project.id, 'Script');
    const copies = await createWork(project.id, 'Copies');
    const setup = await createWork(project.id, 'Setup');

    for (const successor of [script, copies, setup]) {
      await addDependency({ predecessorId: brief.id, successorId: successor.id, actorId: ACTOR });
    }

    await startTask(brief.id, WRITER);
    await completeTask(brief.id, WRITER);

    for (const successor of [script, copies, setup]) {
      const doc = await mongoose.connection
        .collection('tasks')
        .findOne({ _id: new mongoose.Types.ObjectId(successor.id) });
      expect(doc?.status).toBe('todo');
    }

    expect(await WorkflowEventModel.countDocuments({})).toBe(3);

    // Re-running evaluation over settled successors is a no-op.
    const repeated = await evaluateSuccessors(brief.id, {
      actorId: ACTOR,
      directory: stubDirectory(),
    });
    expect(repeated).toHaveLength(3);
    expect(repeated.every((outcome) => outcome.action === 'none')).toBe(true);
    expect(await WorkflowEventModel.countDocuments({})).toBe(3);
  });

  it('holds launch until every prerequisite is done', async () => {
    const { project } = await setupGraph();
    const video = await createWork(project.id, 'Video');
    const copies = await createWork(project.id, 'Copies');
    const setup = await createWork(project.id, 'Setup');
    const launch = await createWork(project.id, 'Launch');

    for (const predecessor of [video, copies, setup]) {
      await addDependency({
        predecessorId: predecessor.id,
        successorId: launch.id,
        actorId: ACTOR,
      });
    }

    for (const predecessor of [video, copies]) {
      await startTask(predecessor.id, WRITER);
      await completeTask(predecessor.id, WRITER);
    }

    let launchDoc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(launch.id) });
    expect(launchDoc?.status).toBe('blocked');

    await startTask(setup.id, WRITER);
    await completeTask(setup.id, WRITER);

    launchDoc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(launch.id) });
    expect(launchDoc?.status).toBe('todo');
  });

  it('preserves manual blocks across readiness', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief');
    const script = await createWork(project.id, 'Script');

    await addDependency({ predecessorId: brief.id, successorId: script.id, actorId: ACTOR });
    await blockTask(script.id, ACTOR, 'Waiting on client feedback');

    await startTask(brief.id, WRITER);
    await completeTask(brief.id, WRITER);

    const doc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(script.id) });
    expect(doc?.status).toBe('blocked');
    expect(doc?.manualBlockReason).toBe('Waiting on client feedback');
    expect(await WorkflowEventModel.countDocuments({ taskId: script.id })).toBe(0);

    const blockers = await getBlockers(script.id);
    expect(blockers.manualReason).toBe('Waiting on client feedback');
    expect(blockers.waitingOn).toEqual([]);
  });

  it('auto-assigns the designated employee when opted in', async () => {
    const { project, client } = await setupGraph();

    await ClientRoleAssignmentModel.create([
      {
        clientId: new mongoose.Types.ObjectId(client.id),
        jobRoleId: new mongoose.Types.ObjectId(roleB),
        userId: new mongoose.Types.ObjectId(EDITOR),
        isPrimary: true,
        isActive: true,
      },
    ]);

    const brief = await createWork(project.id, 'Brief');
    const edit = await createWork(project.id, 'Edit', {
      assignedUserId: null,
      assignedJobRoleId: roleB,
      autoAssign: true,
    });

    await addDependency({ predecessorId: brief.id, successorId: edit.id, actorId: ACTOR });
    await startTask(brief.id, WRITER);
    await completeTask(brief.id, WRITER, { directory: stubDirectory() });

    const doc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(edit.id) });
    expect(doc?.status).toBe('todo');
    expect(doc?.assignedUserId?.toString()).toBe(EDITOR);
    expect(doc?.assignmentSource).toBe('role_mapping');

    const audit = await AuditLogModel.findOne({ action: 'task.assign' }).lean();
    expect(audit).not.toBeNull();
  });

  it('keeps unassigned work visible as needs-assignment, never silent', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief');
    const orphan = await createWork(project.id, 'Orphan', {
      assignedUserId: null,
      assignedJobRoleId: roleA,
      autoAssign: false,
    });

    await addDependency({ predecessorId: brief.id, successorId: orphan.id, actorId: ACTOR });
    await startTask(brief.id, WRITER);
    await completeTask(brief.id, WRITER);

    const doc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(orphan.id) });
    expect(doc?.status).toBe('todo');
    expect(doc?.assignedUserId).toBeNull();

    // Nobody's My Tasks contains it, and the flag says so.
    const mine = await listMyTasks(WRITER, { limit: 50 }, {});
    expect(mine.data.map((row) => row.task.id)).not.toContain(orphan.id);
  });

  it('deduplicates ready events under retry', async () => {
    const { project } = await setupGraph();
    const task = await createWork(project.id, 'Solo');

    const first = await recordReadyEvent(
      task.id,
      project.id,
      '507f1f77bcf86cd7994390aa',
      null,
      3,
      ACTOR,
    );
    const second = await recordReadyEvent(
      task.id,
      project.id,
      '507f1f77bcf86cd7994390aa',
      null,
      3,
      ACTOR,
    );

    expect(first).toBe(second);
    expect(await WorkflowEventModel.countDocuments({ taskId: task.id })).toBe(1);
  });

  it('reevaluates a manually unblocked task against dependencies', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief');
    const script = await createWork(project.id, 'Script');

    await addDependency({ predecessorId: brief.id, successorId: script.id, actorId: ACTOR });
    await blockTask(script.id, ACTOR, 'Manual hold');

    // Manual unblock with unfinished prerequisites re-blocks on dependencies.
    await unblockTask(script.id, ACTOR, 'Trying anyway');

    const doc = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(script.id) });
    expect(doc?.status).toBe('blocked');
    expect(doc?.manualBlockReason).toBeNull();
  });
});
