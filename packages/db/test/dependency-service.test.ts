import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDependency,
  AuditLogModel,
  createClientRecord,
  createProjectRecord,
  createSubtaskRecord,
  createTaskRecord,
  evaluatePrerequisites,
  findDependency,
  getBlockers,
  listDependents,
  listPrerequisites,
  removeDependency,
  seedReferenceData,
  upsertClientTeamMember,
  wouldCreateCycle,
  JobRoleModel,
  ConflictError,
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
const WORKER = new mongoose.Types.ObjectId().toString();

let roleA = '';

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === WORKER) {
        return { id, status: 'active', jobRoleIds: [roleA] };
      }

      return null;
    },
  };
}

async function setupProject(name = 'Singapore Campaign') {
  const client = await createClientRecord({ name: `Client ${name}`, status: 'active' }, ACTOR, {
    directory: stubDirectory(),
  });
  const project = await createProjectRecord(
    {
      clientId: client.id,
      name,
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
    WORKER,
    { isActive: true },
    {
      directory: stubDirectory(),
    },
  );

  return { client, project };
}

async function createWork(projectId: string, title: string, parentId?: string) {
  if (parentId) {
    const result = await createSubtaskRecord(
      parentId,
      {
        title,
        description: null,
        assignedUserId: WORKER,
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
    return result.task;
  }

  return createTaskRecord(
    {
      projectId,
      parentTaskId: null,
      title,
      description: null,
      assignedUserId: WORKER,
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
}

describe.skipIf(!hasTestDatabase || !hasTransactions)('dependency service', () => {
  beforeAll(async () => {
    await connectTestDatabase('dependency_service');
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

  it('links task to task with queryable graph', async () => {
    const { project } = await setupProject();
    const brief = await createWork(project.id, 'Campaign brief');
    const script = await createWork(project.id, 'Write script');

    const edge = await addDependency({
      predecessorId: brief.id,
      successorId: script.id,
      actorId: ACTOR,
    });

    expect(edge.predecessorTaskId).toBe(brief.id);
    expect(await findDependency(edge.id)).not.toBeNull();
    expect(await findDependency(new mongoose.Types.ObjectId().toString())).toBeNull();

    const prereqs = await listPrerequisites(script.id);
    expect(prereqs).toHaveLength(1);
    expect(prereqs[0]?.taskId).toBe(brief.id);
    expect(prereqs[0]?.title).toBe('Campaign brief');

    const dependents = await listDependents(brief.id);
    expect(dependents.map((link) => link.taskId)).toEqual([script.id]);

    const evaluation = await evaluatePrerequisites(script.id);
    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.pending.map((item) => item.title)).toEqual(['Campaign brief']);

    const audit = await AuditLogModel.findOne({ action: 'task.dependency.add' }).lean();
    expect(audit?.entityId.toString()).toBe(edge.id);
  });

  it('supports mixed parent-child and subtask edges', async () => {
    const { project } = await setupProject();
    const parent = await createWork(project.id, 'Produce ad');
    const script = await createWork(project.id, 'Write script', parent.id);
    const edit = await createWork(project.id, 'Edit video', parent.id);

    // Sibling subtask edge is fine.
    await addDependency({ predecessorId: script.id, successorId: edit.id, actorId: ACTOR });

    // Parent waiting on its own child is consistent with completion rules.
    await addDependency({ predecessorId: edit.id, successorId: parent.id, actorId: ACTOR });

    // Child waiting on its own parent deadlocks: rejected.
    await expect(
      addDependency({ predecessorId: parent.id, successorId: script.id, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects self, duplicate, cyclic and cross-project edges', async () => {
    const { project } = await setupProject();
    const a = await createWork(project.id, 'A');
    const b = await createWork(project.id, 'B');
    const c = await createWork(project.id, 'C');

    await expect(
      addDependency({ predecessorId: a.id, successorId: a.id, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ValidationError);

    await addDependency({ predecessorId: a.id, successorId: b.id, actorId: ACTOR });
    await expect(
      addDependency({ predecessorId: a.id, successorId: b.id, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ConflictError);

    await addDependency({ predecessorId: b.id, successorId: c.id, actorId: ACTOR });
    expect(await wouldCreateCycle(project.id, c.id, a.id)).toBe(true);
    expect(await wouldCreateCycle(project.id, a.id, c.id)).toBe(false);
    await expect(
      addDependency({ predecessorId: c.id, successorId: a.id, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ValidationError);

    const other = await setupProject('Other Campaign');
    const outsider = await createWork(other.project.id, 'Outsider');
    await expect(
      addDependency({ predecessorId: outsider.id, successorId: a.id, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      addDependency({
        predecessorId: new mongoose.Types.ObjectId().toString(),
        successorId: a.id,
        actorId: ACTOR,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('serializes concurrent cycle insertion to a single winner', async () => {
    const { project: shared } = await setupProject('Shared');
    const x = await createWork(shared.id, 'X');
    const y = await createWork(shared.id, 'Y');

    const results = await Promise.allSettled([
      addDependency({ predecessorId: x.id, successorId: y.id, actorId: ACTOR }),
      addDependency({ predecessorId: y.id, successorId: x.id, actorId: ACTOR }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const edges = await mongoose.connection.collection('taskdependencies').countDocuments({});
    expect(edges).toBe(1);
  });

  it('blocks actionable successors and reports blockers', async () => {
    const { project } = await setupProject();
    const brief = await createWork(project.id, 'Brief');
    const script = await createWork(project.id, 'Script');

    await addDependency({ predecessorId: brief.id, successorId: script.id, actorId: ACTOR });

    const updated = await mongoose.connection
      .collection('tasks')
      .findOne({ _id: new mongoose.Types.ObjectId(script.id) });
    expect(updated?.status).toBe('blocked');

    const blockers = await getBlockers(script.id);
    expect(blockers.isBlocked).toBe(true);
    expect(blockers.waitingOn.map((item) => item.title)).toEqual(['Brief']);
    expect(blockers.manualReason).toBeNull();
    expect(blockers.needsAssignment).toBe(false);
    expect(blockers.reviewOpen).toBe(false);
  });

  it('removes edges with audit', async () => {
    const { project } = await setupProject();
    const brief = await createWork(project.id, 'Brief');
    const script = await createWork(project.id, 'Script');

    const edge = await addDependency({
      predecessorId: brief.id,
      successorId: script.id,
      actorId: ACTOR,
    });

    await expect(
      removeDependency({ dependencyId: edge.id, actorId: ACTOR, reason: '' }),
    ).rejects.toBeInstanceOf(ValidationError);

    const removed = await removeDependency({
      dependencyId: edge.id,
      actorId: ACTOR,
      reason: 'Brief no longer needed',
    });
    expect(removed.successorId).toBe(script.id);

    expect(await listPrerequisites(script.id)).toEqual([]);

    const audit = await AuditLogModel.findOne({ action: 'task.dependency.remove' }).lean();
    expect(audit?.notes).toBe('Brief no longer needed');

    await expect(
      removeDependency({ dependencyId: edge.id, actorId: ACTOR, reason: 'again' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
