import type { ProjectDetail as ProjectInfo, TaskDetail } from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ProjectService } from '../src/services/projects';
import type { TaskService } from '../src/services/tasks';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const NOW = new Date(0).toISOString();
const PROJECT_ID = '507f1f77bcf86cd7994390e1';
const TASK_ID = '507f1f77bcf86cd7994390e2';
const MISSING_ID = '507f1f77bcf86cd7994390ff';

const TASK: TaskDetail = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  parentTaskId: null,
  title: 'Write Singapore Video Ad Script',
  description: null,
  assignedUserId: null,
  assignedJobRoleId: null,
  dueAt: null,
  priority: 'high',
  status: 'todo',
  approvalRequired: true,
  approverId: null,
  submittedBy: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  completedAt: null,
  revisionCount: 0,
  sopUrl: null,
  referenceUrl: null,
  sourceMeetingId: null,
  manualBlockReason: null,
  autoAssign: false,
  assignmentSource: null,
  version: 0,
  createdBy: null,
  updatedBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  isOverdue: false,
  needsAssignment: true,
  parent: null,
  progress: { total: 1, completed: 0, percent: 0 },
};

function fakeTasks(): TaskService {
  return {
    async listTasks() {
      return { data: [TASK], nextCursor: null };
    },
    async getTask(_actor, id) {
      return id === MISSING_ID ? null : TASK;
    },
    async createTask(_actor, input) {
      return { ...TASK, title: input.title, projectId: input.projectId };
    },
    async updateTask(_actor, _id, input) {
      return { ...TASK, title: input.title ?? TASK.title };
    },
    async assignTask() {
      return TASK;
    },
    async createSubtask() {
      return { task: TASK, warnings: [] };
    },
    async listSubtasks() {
      return [TASK];
    },
    async startTask() {
      return { ...TASK, status: 'in_progress' as const };
    },
    async submitTask() {
      return { ...TASK, status: 'awaiting_approval' as const };
    },
    async approveTask() {
      return { ...TASK, status: 'done' as const };
    },
    async reviseTask() {
      return { ...TASK, status: 'in_progress' as const, revisionCount: 1 };
    },
    async completeTask() {
      return { ...TASK, status: 'done' as const };
    },
    async cancelTask() {
      return { ...TASK, status: 'cancelled' as const };
    },
    async blockTask() {
      return { ...TASK, status: 'blocked' as const };
    },
    async unblockTask() {
      return { ...TASK, status: 'todo' as const };
    },
    async reopenTask() {
      return { ...TASK, status: 'in_progress' as const };
    },
    async listMyTasks() {
      return {
        data: [
          {
            ...TASK,
            projectName: 'Singapore Meta Ads Campaign',
            clientName: 'Travel Enfield',
            clientId: '507f1f77bcf86cd7994390d0',
            parentTitle: null,
            reviewOpen: false,
          },
        ],
        nextCursor: null,
      };
    },
    async createDependency() {
      return {
        id: '507f1f77bcf86cd7994390e9',
        projectId: PROJECT_ID,
        predecessorTaskId: TASK_ID,
        successorTaskId: TASK_ID,
        createdBy: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
    },
    async listPrerequisites() {
      return [];
    },
    async listDependents() {
      return [];
    },
    async removeDependency() {
      return { successorId: TASK_ID };
    },
    async getBlockers() {
      return {
        isBlocked: false,
        manualReason: null,
        waitingOn: [],
        needsAssignment: true,
        reviewOpen: false,
      };
    },
    async previewAssignment() {
      return {
        action: 'needs_manager' as const,
        employeeId: null,
        source: null,
        reason: 'No mapping',
      };
    },
    async resolveAssignment() {
      return TASK;
    },
    async listApprovalQueue() {
      return { data: [], nextCursor: null };
    },
    async listTaskActivity() {
      return [];
    },
    async listReviews() {
      return [];
    },
    async resolveReview() {
      return {
        id: '507f1f77bcf86cd7994390ea',
        taskId: TASK_ID,
        upstreamTaskId: TASK_ID,
        reason: 'Reopened upstream',
        status: 'resolved' as const,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: 'Accepted',
        createdAt: NOW,
        updatedAt: NOW,
      };
    },
  };
}

function fakeProjects(): ProjectService {
  const info: ProjectInfo = {
    id: PROJECT_ID,
    clientId: '507f1f77bcf86cd7994390d0',
    name: 'Singapore Meta Ads Campaign',
    description: null,
    type: 'campaign',
    status: 'planned',
    managerId: null,
    startAt: null,
    targetAt: null,
    createdBy: null,
    updatedBy: null,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
    progress: { total: 0, completed: 0, percent: 0 },
  };

  return {
    async listProjects() {
      return { data: [], nextCursor: null };
    },
    async getProject(_actor, id) {
      return id === MISSING_ID ? null : info;
    },
    async createProject() {
      throw new Error('not implemented in test double');
    },
    async updateProject() {
      throw new Error('not implemented in test double');
    },
    async changeProjectStatus() {
      throw new Error('not implemented in test double');
    },
    async listProjectActivity() {
      return [];
    },
    async listProjectReviews() {
      return [];
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    tasks: fakeTasks(),
    projects: fakeProjects(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('task routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/tasks');
    expect(res.status).toBe(401);
  });

  it('lists tasks with pagination envelope', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get('/api/v1/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toEqual({ nextCursor: null });
  });

  it('lists tasks nested under a project', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/projects/${PROJECT_ID}/tasks`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('creates a task as admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post(`/api/v1/projects/${PROJECT_ID}/tasks`)
      .send({ title: 'Edit Singapore Video Ad', priority: 'medium' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Edit Singapore Video Ad');
  });

  it('validates the create payload', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.post(`/api/v1/projects/${PROJECT_ID}/tasks`).send({});
    expect(res.status).toBe(422);
  });

  it('returns 404 for an unknown task', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/tasks/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it('updates a task and reassigns it', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const updated = await agent.patch(`/api/v1/tasks/${TASK_ID}`).send({ title: 'Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Renamed');

    const assigned = await agent
      .patch(`/api/v1/tasks/${TASK_ID}/assignment`)
      .send({ assignedUserId: null, assignedJobRoleId: null });
    expect(assigned.status).toBe(200);
  });

  it('reads task activity', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/tasks/${TASK_ID}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('creates and lists subtasks', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const created = await agent
      .post(`/api/v1/tasks/${TASK_ID}/subtasks`)
      .send({ title: 'Write script' });
    expect(created.status).toBe(201);
    expect(created.body.data.warnings).toEqual([]);

    const listed = await agent.get(`/api/v1/tasks/${TASK_ID}/subtasks`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
  });

  it('runs status flows and requires reasons where mandated', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    for (const action of ['start', 'submit', 'approve', 'complete'] as const) {
      const res = await agent.post(`/api/v1/tasks/${TASK_ID}/${action}`).send({});
      expect(res.status, action).toBe(200);
    }

    for (const action of ['revise', 'cancel', 'block', 'unblock', 'reopen'] as const) {
      const missing = await agent.post(`/api/v1/tasks/${TASK_ID}/${action}`).send({});
      expect(missing.status, `${action} without reason`).toBe(422);

      const res = await agent
        .post(`/api/v1/tasks/${TASK_ID}/${action}`)
        .send({ reason: 'Documented reason' });
      expect(res.status, action).toBe(200);
    }
  });

  it('serves My Tasks and the approval queue', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const mine = await agent.get('/api/v1/my-tasks');
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const queue = await agent.get('/api/v1/approvals/queue');
    expect(queue.status).toBe(200);
    expect(queue.body.data).toEqual([]);
  });

  it('manages dependency edges with validation', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const created = await agent
      .post(`/api/v1/tasks/${TASK_ID}/dependencies`)
      .send({ predecessorTaskId: '507f1f77bcf86cd7994390e3' });
    expect(created.status).toBe(201);

    const invalid = await agent.post(`/api/v1/tasks/${TASK_ID}/dependencies`).send({});
    expect(invalid.status).toBe(422);

    const prereqs = await agent.get(`/api/v1/tasks/${TASK_ID}/dependencies`);
    expect(prereqs.status).toBe(200);

    const dependents = await agent.get(`/api/v1/tasks/${TASK_ID}/dependents`);
    expect(dependents.status).toBe(200);

    const blockers = await agent.get(`/api/v1/tasks/${TASK_ID}/blockers`);
    expect(blockers.status).toBe(200);
    expect(blockers.body.data.needsAssignment).toBe(true);

    const removed = await agent
      .delete(`/api/v1/tasks/${TASK_ID}/dependencies/507f1f77bcf86cd7994390e9`)
      .send({ reason: 'No longer needed' });
    expect(removed.status).toBe(200);
  });

  it('lists and resolves dependency reviews', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const listed = await agent.get(`/api/v1/tasks/${TASK_ID}/reviews`);
    expect(listed.status).toBe(200);

    const resolved = await agent
      .post(`/api/v1/tasks/${TASK_ID}/reviews/507f1f77bcf86cd7994390ea/resolve`)
      .send({ note: 'Accepted the impact' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
  });

  it('lets employees read the dependency graph (mutations stay server-guarded)', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    // Reads are wired for every role; write denials are enforced in the
    // service layer and covered against the real stack in E2E.
    const prereqs = await agent.get(`/api/v1/tasks/${TASK_ID}/dependencies`);
    expect(prereqs.status).toBe(200);

    const blockers = await agent.get(`/api/v1/tasks/${TASK_ID}/blockers`);
    expect(blockers.status).toBe(200);
  });

  it('previews and resolves assignment', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const preview = await agent.get(`/api/v1/tasks/${TASK_ID}/assignment/candidate`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.action).toBe('needs_manager');

    const resolved = await agent.post(`/api/v1/tasks/${TASK_ID}/assignment/resolve`).send({});
    expect(resolved.status).toBe(200);
  });
});
