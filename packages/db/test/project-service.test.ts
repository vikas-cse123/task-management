import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogModel,
  changeProjectStatus,
  computeProjectProgress,
  ConcurrentModificationError,
  ConflictError,
  createClientRecord,
  createProjectRecord,
  findProject,
  findProjectDetail,
  hasAssignedWorkInProject,
  listAssignedProjectIdsForUser,
  listEntityActivity,
  listProjects,
  updateProjectRecord,
  upsertClientTeamMember,
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
const MANAGER_USER = new mongoose.Types.ObjectId().toString();
const MEMBER_USER = new mongoose.Types.ObjectId().toString();
const OUTSIDER_USER = new mongoose.Types.ObjectId().toString();
const INACTIVE_USER = new mongoose.Types.ObjectId().toString();

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === MANAGER_USER || id === MEMBER_USER || id === OUTSIDER_USER) {
        return { id, status: 'active', jobRoleIds: [] };
      }

      if (id === INACTIVE_USER) {
        return { id, status: 'inactive', jobRoleIds: [] };
      }

      return null;
    },
  };
}

async function createClient(name: string) {
  return createClientRecord({ name, status: 'active' }, ACTOR, { directory: stubDirectory() });
}

describe.skipIf(!hasTestDatabase)('project service', () => {
  beforeAll(async () => {
    await connectTestDatabase('project_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a project under the right client and audits it', async () => {
    const client = await createClient('Travel Enfield');

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

    expect(project.clientId).toBe(client.id);
    expect(project.status).toBe('planned');
    expect(project.version).toBe(0);

    const audit = await AuditLogModel.findOne({ action: 'project.create' }).lean();
    expect(audit?.entityId.toString()).toBe(project.id);
  });

  it('rejects unknown clients and duplicate names per client', async () => {
    const client = await createClient('Travel Enfield');
    const other = await createClient('Bali Travels');

    await expect(
      createProjectRecord(
        {
          clientId: new mongoose.Types.ObjectId().toString(),
          name: 'Ghost',
          description: null,
          type: 'campaign',
          status: 'planned',
          managerId: null,
          startAt: null,
          targetAt: null,
        },
        ACTOR,
        { directory: stubDirectory() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    const input = {
      clientId: client.id,
      name: 'Singapore Meta Ads Campaign',
      description: null,
      type: 'campaign' as const,
      status: 'planned' as const,
      managerId: null,
      startAt: null,
      targetAt: null,
    };
    await createProjectRecord(input, ACTOR, { directory: stubDirectory() });

    await expect(
      createProjectRecord(input, ACTOR, { directory: stubDirectory() }),
    ).rejects.toBeInstanceOf(ConflictError);

    const sameNameElsewhere = await createProjectRecord({ ...input, clientId: other.id }, ACTOR, {
      directory: stubDirectory(),
    });
    expect(sameNameElsewhere.clientId).toBe(other.id);
  });

  it('validates the manager and grants membership', async () => {
    const client = await createClient('Travel Enfield');

    const base = {
      clientId: client.id,
      name: 'Kashmir Meta Ads Campaign',
      description: null,
      type: 'campaign' as const,
      status: 'planned' as const,
      managerId: null as string | null,
      startAt: null,
      targetAt: null,
    };

    await expect(
      createProjectRecord({ ...base, managerId: INACTIVE_USER }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const project = await createProjectRecord({ ...base, managerId: MANAGER_USER }, ACTOR, {
      directory: stubDirectory(),
    });

    expect(project.managerId).toBe(MANAGER_USER);

    const membership = await mongoose.connection
      .collection('clientteammembers')
      .findOne({ clientId: new mongoose.Types.ObjectId(client.id) });
    expect(membership?.isActive).toBe(true);
    expect(membership?.roleInTeam).toBe('manager');

    const assignment = await updateProjectRecord(project.id, { managerId: MEMBER_USER }, ACTOR, {
      directory: stubDirectory(),
    });
    expect(assignment.managerId).toBe(MEMBER_USER);

    const managerAudits = await AuditLogModel.countDocuments({ action: 'project.manager.update' });
    expect(managerAudits).toBe(1);
  });

  it('rejects an inverted date range', async () => {
    const client = await createClient('Travel Enfield');

    await expect(
      createProjectRecord(
        {
          clientId: client.id,
          name: 'Bad Dates',
          description: null,
          type: 'general',
          status: 'planned',
          managerId: null,
          startAt: '2026-11-01T00:00:00.000Z',
          targetAt: '2026-10-01T00:00:00.000Z',
        },
        ACTOR,
        { directory: stubDirectory() },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('scope-filters listing for members and assignees', async () => {
    const alpha = await createClient('Alpha Travels');
    const beta = await createClient('Beta Travels');

    const inScope = await createProjectRecord(
      {
        clientId: alpha.id,
        name: 'Alpha Campaign',
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
        clientId: beta.id,
        name: 'Beta Campaign',
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
      alpha.id,
      MEMBER_USER,
      { isActive: true },
      {
        directory: stubDirectory(),
      },
    );

    // Raw task assignment for the assignee scope (task service lands in Step 8).
    await mongoose.connection.collection('tasks').insertOne({
      projectId: new mongoose.Types.ObjectId(inScope.id),
      parentTaskId: null,
      title: 'Assigned work',
      status: 'todo',
      assignedUserId: new mongoose.Types.ObjectId(OUTSIDER_USER),
    });

    const memberPage = await listProjects({ limit: 50 }, { kind: 'member', userId: MEMBER_USER });
    expect(memberPage.data.map((project) => project.id)).toEqual([inScope.id]);

    const outsiderPage = await listProjects(
      { limit: 50 },
      { kind: 'member', userId: OUTSIDER_USER },
    );
    expect(outsiderPage.data).toHaveLength(0);

    const assigneePage = await listProjects(
      { limit: 50 },
      { kind: 'assignee', userId: OUTSIDER_USER },
    );
    expect(assigneePage.data.map((project) => project.id)).toEqual([inScope.id]);

    expect(await hasAssignedWorkInProject(inScope.id, OUTSIDER_USER)).toBe(true);
    expect(await hasAssignedWorkInProject(inScope.id, MEMBER_USER)).toBe(false);
    expect(await listAssignedProjectIdsForUser(MEMBER_USER)).toEqual([]);

    const filtered = await listProjects({ limit: 50, search: 'alpha' }, { kind: 'all' });
    expect(filtered.data.map((project) => project.name)).toEqual(['Alpha Campaign']);
  });

  it('changes status without touching tasks and records activity', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProjectRecord(
      {
        clientId: client.id,
        name: 'Status Campaign',
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

    await mongoose.connection.collection('tasks').insertOne({
      projectId: new mongoose.Types.ObjectId(project.id),
      parentTaskId: null,
      title: 'Untouched',
      status: 'in_progress',
    });

    const changed = await changeProjectStatus(project.id, 'live', ACTOR, { reason: 'Launched' });
    expect(changed.status).toBe('live');

    const task = await mongoose.connection
      .collection('tasks')
      .findOne({ projectId: new mongoose.Types.ObjectId(project.id) });
    expect(task?.status).toBe('in_progress');

    const activity = await listEntityActivity('project', project.id);
    expect(activity.map((entry) => entry.action)).toContain('project.status.update');
    expect(activity.map((entry) => entry.action)).toContain('project.create');

    const detail = await findProjectDetail(project.id);
    expect(detail?.progress).toEqual({ total: 1, completed: 0, percent: 0 });
    expect(await computeProjectProgress(project.id)).toEqual({
      total: 1,
      completed: 0,
      percent: 0,
    });
    expect(await findProject(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('rejects stale versions', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProjectRecord(
      {
        clientId: client.id,
        name: 'Versioned',
        description: null,
        type: 'general',
        status: 'planned',
        managerId: null,
        startAt: null,
        targetAt: null,
      },
      ACTOR,
      { directory: stubDirectory() },
    );

    await expect(
      updateProjectRecord(
        project.id,
        { name: 'Renamed' },
        ACTOR,
        { directory: stubDirectory() },
        99,
      ),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    await expect(
      changeProjectStatus(project.id, 'completed', ACTOR, { expectedVersion: 99 }),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
  });
});
