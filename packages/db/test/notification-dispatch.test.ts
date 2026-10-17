import {
  createMockWhatsAppProvider,
  NOTIFICATION_MAX_ATTEMPTS,
  WhatsAppProviderError,
  type WhatsAppProvider,
} from '@interscale/shared';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTaskDeadlineEventKey,
  claimDueOutbox,
  computeBackoffMs,
  enqueueNotification,
  getNotificationSettings,
  listInAppNotifications,
  markInAppNotificationRead,
  NotificationInboxModel,
  NotificationOutboxModel,
  processDueNotifications,
  recoverStaleClaims,
  retryFailedNotification,
  TaskModel,
  updateNotificationSettings,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ADMIN = new mongoose.Types.ObjectId().toString();
const EMPLOYEE = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const PROJECT = new mongoose.Types.ObjectId();
const CLIENT = new mongoose.Types.ObjectId();

async function insertUser(
  id: string,
  options: { phone?: string | null; optIn?: boolean; name?: string } = {},
): Promise<void> {
  await mongoose.connection.collection('user').insertOne({
    _id: new mongoose.Types.ObjectId(id),
    name: options.name ?? 'Test User',
    email: `${id}@example.com`,
    whatsappNumber: options.phone ?? '+919876543210',
    whatsappOptIn: options.optIn ?? true,
    whatsappOptInAt: (options.optIn ?? true) ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertTask(
  options: { dueAt?: Date | null; status?: 'todo' | 'done' } = {},
): Promise<string> {
  const [task] = await TaskModel.create([
    {
      projectId: PROJECT,
      title: 'Design creatives',
      status: options.status ?? 'todo',
      dueAt: options.dueAt ?? null,
      assignedUserId: new mongoose.Types.ObjectId(EMPLOYEE),
      priority: 'medium',
      approvalRequired: false,
      createdBy: new mongoose.Types.ObjectId(ADMIN),
      updatedBy: new mongoose.Types.ObjectId(ADMIN),
    },
  ]);

  if (!task) {
    throw new Error('failed to create task');
  }

  return task._id.toString();
}

async function enqueueDueSoon(taskId: string, dueAt: Date, recipientUserId = EMPLOYEE) {
  return enqueueNotification({
    eventKey: buildTaskDeadlineEventKey('task.due_soon', taskId, dueAt, recipientUserId),
    eventType: 'task.due_soon',
    category: 'deadline',
    recipientUserId,
    recipientRole: 'assignee',
    recipientPhone: '+919876543210',
    taskId,
    projectId: PROJECT.toString(),
    clientId: CLIENT.toString(),
    templateValues: {
      employee_name: 'Test User',
      task_title: 'Design creatives',
      due_date: '2026-02-01 09:00',
      url: 'https://app.interscale.local/tasks/1',
    },
    url: 'https://app.interscale.local/tasks/1',
    deadlineAt: dueAt,
    assignedUserId: recipientUserId,
  });
}

function failingProvider(retryable: boolean): WhatsAppProvider {
  return {
    kind: 'mock',
    isConfigured: () => true,
    async send() {
      throw new WhatsAppProviderError('Simulated provider failure', { retryable });
    },
  };
}

describe.skipIf(!hasTestDatabase)('notification dispatch', () => {
  beforeAll(async () => {
    await connectTestDatabase('notify_dispatch');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await insertUser(EMPLOYEE, { name: 'Employee One' });
    await insertUser(OTHER, { name: 'Other Employee' });
    await mongoose.connection.collection('clients').insertOne({
      _id: CLIENT,
      name: 'Acme Corp',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await mongoose.connection.collection('projects').insertOne({
      _id: PROJECT,
      name: 'Meta Ads Campaign',
      clientId: CLIENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await updateNotificationSettings({ enabled: true }, ADMIN);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('schedules a bounded retry with backoff on a retryable provider error', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);

    const now = new Date();
    const summary = await processDueNotifications({
      provider: failingProvider(true),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now,
    });

    expect(summary.retried).toBe(1);
    expect(summary.failed).toBe(0);

    const record = await NotificationOutboxModel.findOne().lean();
    expect(record?.status).toBe('retry_scheduled');
    expect(record?.attemptCount).toBe(1);
    expect(record?.nextAttemptAt?.getTime()).toBe(now.getTime() + computeBackoffMs(1));
    expect(record?.lastError).toContain('Simulated provider failure');
  });

  it('marks the record failed once the attempt budget is exhausted', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);
    // The claim increments attemptCount; start one below the ceiling.
    await NotificationOutboxModel.updateOne(
      {},
      { $set: { attemptCount: NOTIFICATION_MAX_ATTEMPTS - 1 } },
    );

    const summary = await processDueNotifications({
      provider: failingProvider(true),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now: new Date(),
    });

    expect(summary.failed).toBe(1);
    const record = await NotificationOutboxModel.findOne().lean();
    expect(record?.status).toBe('failed');
    expect(record?.failedAt).toBeInstanceOf(Date);
    expect(record?.nextAttemptAt).toBeNull();
  });

  it('fails immediately on a non-retryable provider error', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);

    const summary = await processDueNotifications({
      provider: failingProvider(false),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now: new Date(),
    });

    expect(summary.failed).toBe(1);
    expect((await NotificationOutboxModel.findOne().lean())?.status).toBe('failed');
  });

  it('requeues only failed records through the manual retry path', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);
    await NotificationOutboxModel.updateOne(
      {},
      { $set: { attemptCount: NOTIFICATION_MAX_ATTEMPTS - 1 } },
    );
    await processDueNotifications({
      provider: failingProvider(true),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now: new Date(),
    });

    const failed = await NotificationOutboxModel.findOne().lean();
    expect(await retryFailedNotification(failed?._id.toString() ?? '')).toBe(true);

    const requeued = await NotificationOutboxModel.findOne().lean();
    expect(requeued?.status).toBe('retry_scheduled');
    expect(requeued?.lastError).toBeNull();
    // A second retry on a non-failed record is a no-op.
    expect(await retryFailedNotification(failed?._id.toString() ?? '')).toBe(false);
  });

  it('never lets two workers claim the same record', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt, EMPLOYEE);
    await enqueueDueSoon(taskId, dueAt, OTHER);

    const now = new Date();
    const [first, second] = await Promise.all([
      claimDueOutbox({ now, limit: 5, workerId: 'worker-a' }),
      claimDueOutbox({ now, limit: 5, workerId: 'worker-b' }),
    ]);

    const ids = [...first, ...second].map((record) => record._id.toString());
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('recovers a stale processing claim only after the lease expires', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await NotificationOutboxModel.updateOne(
      {},
      { $set: { status: 'processing', claimedAt: stale, claimedBy: 'dead-worker' } },
    );

    const now = new Date();
    const tooSoon = await recoverStaleClaims({ now, leaseMs: 30 * 60 * 1000 });
    expect(tooSoon).toBe(0);
    expect((await NotificationOutboxModel.findOne().lean())?.status).toBe('processing');

    const recovered = await recoverStaleClaims({ now, leaseMs: 5 * 60 * 1000 });
    expect(recovered).toBe(1);
    const record = await NotificationOutboxModel.findOne().lean();
    expect(record?.status).toBe('retry_scheduled');
    expect(record?.claimedBy).toBeNull();
  });

  it('suppresses a pending send after opt-out and never replays it on re-opt-in', async () => {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt });
    await enqueueDueSoon(taskId, dueAt);
    await mongoose.connection
      .collection('user')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(EMPLOYEE) },
        { $set: { whatsappOptIn: false } },
      );

    const suppressed = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now: new Date(),
    });
    expect(suppressed.suppressed).toBe(1);
    const record = await NotificationOutboxModel.findOne().lean();
    expect(record?.status).toBe('suppressed');
    expect(record?.suppressionReason).toBe('no_consent');

    // Opting back in must not resurrect the suppressed record.
    await mongoose.connection
      .collection('user')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(EMPLOYEE) },
        { $set: { whatsappOptIn: true, whatsappOptInAt: new Date() } },
      );
    const afterOptIn = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
      now: new Date(),
    });
    expect(afterOptIn.sent).toBe(0);
    expect(afterOptIn.claimed).toBe(0);
    expect((await NotificationOutboxModel.findOne().lean())?.status).toBe('suppressed');
  });

  it('keeps in-app notifications isolated per recipient', async () => {
    await enqueueNotification({
      eventKey: 'task.assigned:iso-employee',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Employee One',
        task_title: 'T',
        project_name: 'P',
        due_date: '2026-01-01 09:00',
        url: 'https://x',
      },
    });

    const otherPage = await listInAppNotifications(OTHER, { limit: 50, unreadOnly: false });
    expect(otherPage.data).toHaveLength(0);

    const employeePage = await listInAppNotifications(EMPLOYEE, { limit: 50, unreadOnly: false });
    expect(employeePage.data).toHaveLength(1);
    const notificationId = employeePage.data[0]?.id ?? '';

    // Another user cannot mark someone else's notification as read.
    expect(await markInAppNotificationRead(OTHER, notificationId)).toBe(false);
    expect(await markInAppNotificationRead(EMPLOYEE, notificationId)).toBe(true);
    expect(await NotificationInboxModel.countDocuments({ readAt: null })).toBe(0);
  });
});
