import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { DashboardService } from '../src/services/dashboard';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

function fakeDashboard(): DashboardService {
  return {
    async getSummary() {
      return {
        clients: { total: 2, active: 2, withoutManager: 1 },
        projects: { total: 3, open: 2 },
        tasks: { total: 5, dueToday: 1, overdue: 1, blocked: 1, awaitingApproval: 1, done: 1 },
        myWork: { total: 2, dueToday: 1, overdue: 0, blocked: 0, awaitingApproval: 1, done: 0 },
        approvalsPending: 1,
        workloadByEmployee: [],
        workloadByRole: [],
      };
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    dashboard: fakeDashboard(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('dashboard routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
  });

  it('serves the scoped summary to any active user', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.tasks.overdue).toBe(1);
    expect(res.body.data.myWork.total).toBe(2);
  });
});
