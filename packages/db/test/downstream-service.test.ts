import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDependency,
  approveTask,
  AuditLogModel,
  cancelTask,
  completeTask,
  createClientRecord,
  createProjectRecord,
  createTaskRecord,
  flagDependencyReview,
  getBlockers,
  listDependencyReviews,
  reevaluateTask,
  removeDependency,
  reopenTask,
  resolveDependencyReview,
  startTask,
  submitTask,
  upsertClientTeamMember,
  JobRoleModel,
  seedReferenceData,
  ConflictError,
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
const MANAGER = new mongoose.Types.ObjectId().toString();
const WORKER = new mongoose.Types.ObjectId().toString();

let roleA = '';

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if ([MANAGER, WORKER].includes(id)) {
        return { id, status: 'active', jobRoleIds: [roleA] };
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

  for (const user of [MANAGER, WORKER]) {
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

async function createWork(projectId: string, title: string, assigned = WORKER) {
  return createTaskRecord(
    {
      projectId,
      parentTaskId: null,
      title,
      description: null,
      assignedUserId: assigned,
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

async function taskStatus(id: string): Promise<string | undefined> {
  const doc = await mongoose.connection
    .collection('tasks')
    .findOne({ _id: new mongoose.Types.ObjectId(id) });
  return doc?.status as string | undefined;
}

describe.skipIf(!hasTestDatabase || !hasTransactions)('downstream safety', () => {
  beforeAll(async () => {
    await connectTestDatabase('downstream_service');
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

  it('reopening a prerequisite blocks fresh work and flags the rest', async () => {
    const { project } = await setupGraph();
    const script = await createWork(project.id, 'Script');
    const fresh = await createWork(project.id, 'Fresh edit');
    const active = await createWork(project.id, 'Active edit');
    const finished = await createWork(project.id, 'Finished edit');

    for (const successor of [fresh, active, finished]) {
      await addDependency({ predecessorId: script.id, successorId: successor.id, actorId: ACTOR });
    }

    await startTask(script.id, WORKER);
    await completeTask(script.id, WORKER);

    await startTask(active.id, WORKER);
    await startTask(finished.id, WORKER);
    await completeTask(finished.id, WORKER);
    const completedAt = (
      await mongoose.connection
        .collection('tasks')
        .findOne({ _id: new mongoose.Types.ObjectId(finished.id) })
    )?.completedAt;

    await reopenTask(script.id, MANAGER, 'Client wants a new opening');

    // To Do work cannot newly start on a broken prerequisite.
    expect(await taskStatus(fresh.id)).toBe('blocked');
    // In-flight and completed work keeps state and history.
    expect(await taskStatus(active.id)).toBe('in_progress');
    expect(await taskStatus(finished.id)).toBe('done');
    expect(
      (
        await mongoose.connection
          .collection('tasks')
          .findOne({ _id: new mongoose.Types.ObjectId(finished.id) })
      )?.completedAt,
    ).toEqual(completedAt);

    for (const successor of [fresh, active, finished]) {
      const reviews = await listDependencyReviews(successor.id);
      expect(reviews.filter((review) => review.status === 'open')).toHaveLength(1);
    }

    const blockers = await getBlockers(fresh.id);
    expect(blockers.reviewOpen).toBe(true);

    // Reopened work cannot restart the downstream while blocked.
    await expect(startTask(fresh.id, WORKER)).rejects.toBeInstanceOf(ValidationError);
  });

  it('cancelling a prerequisite never unlocks dependents', async () => {
    const { project } = await setupGraph();
    const script = await createWork(project.id, 'Script');
    const edit = await createWork(project.id, 'Edit');

    await addDependency({ predecessorId: script.id, successorId: edit.id, actorId: ACTOR });
    await cancelTask(script.id, MANAGER, 'Brief withdrawn');

    expect(await taskStatus(edit.id)).toBe('blocked');

    const reviews = await listDependencyReviews(edit.id);
    expect(reviews.filter((review) => review.status === 'open')).toHaveLength(1);
  });

  it('removal reevaluates safely with remaining prerequisites', async () => {
    const { project } = await setupGraph();
    const first = await createWork(project.id, 'First');
    const second = await createWork(project.id, 'Second');
    const launch = await createWork(project.id, 'Launch');

    const edgeA = await addDependency({
      predecessorId: first.id,
      successorId: launch.id,
      actorId: ACTOR,
    });
    await addDependency({ predecessorId: second.id, successorId: launch.id, actorId: ACTOR });

    await startTask(first.id, WORKER);
    await completeTask(first.id, WORKER);
    expect(await taskStatus(launch.id)).toBe('blocked');

    await removeDependency({ dependencyId: edgeA.id, actorId: MANAGER, reason: 'Not needed' });
    await reevaluateTask(launch.id, { actorId: MANAGER, directory: stubDirectory() });
    expect(await taskStatus(launch.id)).toBe('blocked');

    const edges = await mongoose.connection.collection('taskdependencies').find({}).toArray();
    await removeDependency({
      dependencyId: edges[0]?._id.toString() ?? '',
      actorId: MANAGER,
      reason: 'Clear',
    });
    await reevaluateTask(launch.id, { actorId: MANAGER, directory: stubDirectory() });
    expect(await taskStatus(launch.id)).toBe('todo');
  });

  it('resolves reviews with recorded decisions only', async () => {
    const { project } = await setupGraph();
    const script = await createWork(project.id, 'Script');
    const edit = await createWork(project.id, 'Edit');

    await addDependency({ predecessorId: script.id, successorId: edit.id, actorId: ACTOR });
    await startTask(script.id, WORKER);
    await completeTask(script.id, WORKER);
    await reopenTask(script.id, MANAGER, 'Needs a tweak');

    const [review] = await listDependencyReviews(edit.id);
    expect(review?.status).toBe('open');

    await expect(
      resolveDependencyReview('507f1f77bcf86cd7994390ff', MANAGER, 'ok'),
    ).rejects.toBeInstanceOf(Error);
    await expect(resolveDependencyReview(review?.id ?? '', MANAGER, '   ')).rejects.toBeInstanceOf(
      ValidationError,
    );

    const resolved = await resolveDependencyReview(
      review?.id ?? '',
      MANAGER,
      'Accepted: edit continues',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionNote).toBe('Accepted: edit continues');

    await expect(
      resolveDependencyReview(review?.id ?? '', MANAGER, 'Again'),
    ).rejects.toBeInstanceOf(ValidationError);

    const audits = await AuditLogModel.countDocuments({ action: 'dependency.review.resolve' });
    expect(audits).toBe(1);

    expect((await getBlockers(edit.id)).reviewOpen).toBe(false);
  });

  it('serializes concurrent duplicate edge insertion', async () => {
    const { project } = await setupGraph();
    const a = await createWork(project.id, 'A');
    const b = await createWork(project.id, 'B');

    const results = await Promise.allSettled([
      addDependency({ predecessorId: a.id, successorId: b.id, actorId: ACTOR }),
      addDependency({ predecessorId: a.id, successorId: b.id, actorId: ACTOR }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');

    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ConflictError);
    }
  });

  it('flags added prerequisites on in-flight work without rewriting it', async () => {
    const { project } = await setupGraph();
    const brief = await createWork(project.id, 'Brief');
    const edit = await createWork(project.id, 'Edit');

    await startTask(edit.id, WORKER);
    await addDependency({ predecessorId: brief.id, successorId: edit.id, actorId: ACTOR });

    expect(await taskStatus(edit.id)).toBe('in_progress');

    const reviews = await listDependencyReviews(edit.id);
    expect(reviews.filter((review) => review.status === 'open')).toHaveLength(1);
  });

  it('keeps approval submission from unlocking anything', async () => {
    const { project } = await setupGraph();

    const approvable = await createTaskRecord(
      {
        projectId: project.id,
        parentTaskId: null,
        title: 'Approvable',
        description: null,
        assignedUserId: WORKER,
        assignedJobRoleId: roleA,
        dueAt: null,
        priority: 'medium',
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
    const edit = await createWork(project.id, 'Edit');

    await addDependency({ predecessorId: approvable.id, successorId: edit.id, actorId: ACTOR });

    await startTask(approvable.id, WORKER);
    await submitTask(approvable.id, WORKER);

    // Awaiting Approval is not Done: the dependent stays blocked.
    expect(await taskStatus(edit.id)).toBe('blocked');

    await approveTask(approvable.id, MANAGER);
    expect(await taskStatus(edit.id)).toBe('todo');
  });

  it('flags idempotently per open pair', async () => {
    const { project } = await setupGraph();
    const script = await createWork(project.id, 'Script');
    const edit = await createWork(project.id, 'Edit');

    const first = await flagDependencyReview(edit.id, script.id, 'Heads up', ACTOR);
    const second = await flagDependencyReview(edit.id, script.id, 'Heads up again', ACTOR);

    expect(first.id).toBe(second.id);

    const reviews = await listDependencyReviews(edit.id);
    expect(reviews.filter((review) => review.status === 'open')).toHaveLength(1);
  });
});
