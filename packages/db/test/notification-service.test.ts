import { createMockWhatsAppProvider, type TaskStatus } from '@interscale/shared';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyDeliveryConfirmation,
  buildTaskDeadlineEventKey,
  enqueueNotification,
  getNotificationSettings,
  getUnreadInAppCount,
  listInAppNotifications,
  listNotificationLog,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  notificationDeliveryStats,
  NotificationAttemptLogModel,
  NotificationInboxModel,
  NotificationOutboxModel,
  processDueNotifications,
  suppressTaskDeadlineNotifications,
  TaskModel,
  updateNotificationSettings,
  updateNotificationTemplateMappings,
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
const PROJECT = new mongoose.Types.ObjectId();
const CLIENT = new mongoose.Types.ObjectId();

async function insertUser(
  id: string,
  options: { phone?: string | null; optIn?: boolean } = {},
): Promise<void> {
  await mongoose.connection.collection('user').insertOne({
    _id: new mongoose.Types.ObjectId(id),
    name: 'Test User',
    email: `${id}@example.com`,
    whatsappNumber: options.phone ?? '+919876543210',
    whatsappOptIn: options.optIn ?? true,
    whatsappOptInAt: (options.optIn ?? true) ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertTask(options: {
  status?: TaskStatus;
  dueAt?: Date | null;
  assignedUserId?: string | null;
}): Promise<string> {
  const [task] = await TaskModel.create([
    {
      projectId: PROJECT,
      title: 'Test task',
      status: options.status ?? 'todo',
      dueAt: options.dueAt ?? null,
      assignedUserId: options.assignedUserId
        ? new mongoose.Types.ObjectId(options.assignedUserId)
        : null,
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

function deadlineValues(): Record<string, string> {
  return {
    employee_name: 'Test User',
    task_title: 'Test task',
    due_date: '2026-01-01 09:00',
    url: 'https://app.interscale.local/tasks/1',
  };
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
    templateValues: deadlineValues(),
    url: 'https://app.interscale.local/tasks/1',
    deadlineAt: dueAt,
    assignedUserId: recipientUserId,
  });
}

describe.skipIf(!hasTestDatabase)('notification service', () => {
  beforeAll(async () => {
    await connectTestDatabase('notification_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await insertUser(EMPLOYEE);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('returns disabled defaults with canonical mappings', async () => {
    const settings = await getNotificationSettings();

    expect(settings.enabled).toBe(false);
    expect(settings.templateMappings.length).toBeGreaterThan(0);
    expect(settings.dueSoonLeadHours).toBe(24);
  });

  it('enables the channel and stamps activatedAt once', async () => {
    const enabled = await updateNotificationSettings({ enabled: true }, ADMIN);

    expect(enabled.enabled).toBe(true);
    expect(enabled.activatedAt).not.toBeNull();

    const activatedAt = enabled.activatedAt;

    const again = await updateNotificationSettings({ dueSoonLeadHours: 12 }, ADMIN);
    expect(again.activatedAt?.getTime()).toBe(activatedAt?.getTime());
    expect(again.dueSoonLeadHours).toBe(12);
  });

  it('writes the in-app copy even when the channel is disabled', async () => {
    const result = await enqueueNotification({
      eventKey: 'task.assigned:1',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Test User',
        task_title: 'Test task',
        project_name: 'Project',
        due_date: '2026-01-01 09:00',
        url: 'https://app.interscale.local/tasks/1',
      },
      url: 'https://app.interscale.local/tasks/1',
    });

    expect(result.whatsappQueued).toBe(false);
    expect(result.inboxId).not.toBeNull();
    expect(await NotificationOutboxModel.countDocuments()).toBe(0);
    expect(await NotificationInboxModel.countDocuments()).toBe(1);
  });

  it('queues WhatsApp and is idempotent when enabled', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);

    const first = await enqueueNotification({
      eventKey: 'task.assigned:2',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Test User',
        task_title: 'Test task',
        project_name: 'Project',
        due_date: '2026-01-01 09:00',
        url: 'https://app.interscale.local/tasks/1',
      },
      url: 'https://app.interscale.local/tasks/1',
    });

    const second = await enqueueNotification({
      eventKey: 'task.assigned:2',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Test User',
        task_title: 'Test task',
        project_name: 'Project',
        due_date: '2026-01-01 09:00',
        url: 'https://app.interscale.local/tasks/1',
      },
      url: 'https://app.interscale.local/tasks/1',
    });

    expect(first.whatsappQueued).toBe(true);
    expect(second.whatsappQueued).toBe(false);
    expect(await NotificationOutboxModel.countDocuments()).toBe(1);
    expect(await NotificationInboxModel.countDocuments()).toBe(1);
  });

  it('sends a due reminder through the provider and records the attempt', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    expect(summary.sent).toBe(1);
    const outbox = await NotificationOutboxModel.findOne().lean();
    expect(outbox?.status).toBe('sent');
    expect(outbox?.providerMessageId).toContain('wamid.mock.');
    expect(await NotificationAttemptLogModel.countDocuments()).toBe(1);
  });

  it('suppresses when the recipient has not opted in, keeping the in-app copy', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    await mongoose.connection
      .collection('user')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(EMPLOYEE) },
        { $set: { whatsappOptIn: false } },
      );

    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    expect(summary.suppressed).toBe(1);
    const outbox = await NotificationOutboxModel.findOne().lean();
    expect(outbox?.status).toBe('suppressed');
    expect(outbox?.suppressionReason).toBe('no_consent');
    expect(await NotificationInboxModel.countDocuments()).toBe(1);
  });

  it('suppresses a deadline reminder whose task is no longer actionable', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE, status: 'todo' });
    await enqueueDueSoon(taskId, dueAt);
    await TaskModel.updateOne({ _id: taskId }, { $set: { status: 'done' } });

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    expect(summary.suppressed).toBe(1);
    const outbox = await NotificationOutboxModel.findOne().lean();
    expect(outbox?.suppressionReason).toBe('task_no_longer_actionable');
  });

  it('suppresses a reminder whose deadline changed', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);
    await TaskModel.updateOne(
      { _id: taskId },
      { $set: { dueAt: new Date(Date.now() + 7200_000) } },
    );

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    expect(summary.suppressed).toBe(1);
    expect((await NotificationOutboxModel.findOne().lean())?.suppressionReason).toBe(
      'deadline_changed',
    );
  });

  it('suppresses pending deadline reminders explicitly', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);

    const count = await suppressTaskDeadlineNotifications(taskId, 'task_no_longer_actionable');
    expect(count).toBe(1);
    expect((await NotificationOutboxModel.findOne().lean())?.status).toBe('suppressed');
  });

  it('lists and reads in-app notifications', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const one = await enqueueNotification({
      eventKey: 'task.assigned:list-1',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Test User',
        task_title: 'T',
        project_name: 'P',
        due_date: '2026-01-01 09:00',
        url: 'https://x',
      },
    });

    const page = await listInAppNotifications(EMPLOYEE, {
      limit: 50,
      unreadOnly: false,
    });

    expect(page.data).toHaveLength(1);
    expect(await getUnreadInAppCount(EMPLOYEE)).toBe(1);

    expect(one.inboxId).not.toBeNull();
    expect(await markInAppNotificationRead(EMPLOYEE, one.inboxId as string)).toBe(true);
    expect(await getUnreadInAppCount(EMPLOYEE)).toBe(0);

    await enqueueNotification({
      eventKey: 'task.assigned:list-2',
      eventType: 'task.assigned',
      category: 'task',
      recipientUserId: EMPLOYEE,
      recipientRole: 'assignee',
      templateValues: {
        employee_name: 'Test User',
        task_title: 'T2',
        project_name: 'P',
        due_date: '2026-01-01 09:00',
        url: 'https://x',
      },
    });
    expect(await markAllInAppNotificationsRead(EMPLOYEE)).toBe(1);
  });

  it('applies delivery confirmations without regressing', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);

    await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    const sent = await NotificationOutboxModel.findOne().lean();
    const messageId = sent?.providerMessageId as string;

    expect(
      await applyDeliveryConfirmation({
        providerMessageId: messageId,
        status: 'read',
        at: new Date(),
      }),
    ).toBe(true);
    // A late "delivered" after "read" must not regress the status.
    expect(
      await applyDeliveryConfirmation({
        providerMessageId: messageId,
        status: 'delivered',
        at: new Date(),
      }),
    ).toBe(false);
    expect((await NotificationOutboxModel.findOne().lean())?.status).toBe('read');
  });

  it('reports delivery statistics and the admin log', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);
    await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    const stats = await notificationDeliveryStats();
    expect(stats.sent).toBe(1);

    const log = await listNotificationLog({ limit: 50 });
    expect(log.data).toHaveLength(1);
    expect(log.data[0]?.status).toBe('sent');
  });

  it('updates template mappings safely', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const settings = await updateNotificationTemplateMappings(
      {
        mappings: [{ eventType: 'task.assigned', templateKey: 'task_assigned', enabled: false }],
      },
      ADMIN,
    );

    const mapping = settings.templateMappings.find((entry) => entry.eventType === 'task.assigned');
    expect(mapping?.enabled).toBe(false);
  });

  it('does not dispatch records created before activation', async () => {
    await updateNotificationSettings({ enabled: true }, ADMIN);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    const taskId = await insertTask({ dueAt, assignedUserId: EMPLOYEE });
    await enqueueDueSoon(taskId, dueAt);
    // Backdate the record to before the channel was activated (bypass timestamps).
    await NotificationOutboxModel.collection.updateOne(
      { taskId: new mongoose.Types.ObjectId(taskId) },
      { $set: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) } },
    );

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'test-worker',
    });

    expect(summary.suppressed).toBe(1);
  });
});
