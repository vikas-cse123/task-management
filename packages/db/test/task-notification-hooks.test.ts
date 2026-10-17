import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NotificationInboxModel,
  NotificationOutboxModel,
  TaskModel,
  notifyTaskAssignment,
  notifyTaskDeadline,
  notifyTaskEscalation,
  notifyTaskReady,
  notifyTaskRevisionRequested,
  suppressTaskOutstandingNotifications,
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
const MANAGER = new mongoose.Types.ObjectId().toString();
const PROJECT = new mongoose.Types.ObjectId();
const CLIENT = new mongoose.Types.ObjectId();

async function insertUser(id: string, name: string): Promise<void> {
  await mongoose.connection.collection('user').insertOne({
    _id: new mongoose.Types.ObjectId(id),
    name,
    email: `${id}@example.com`,
    whatsappNumber: '+919876543210',
    whatsappOptIn: true,
    whatsappOptInAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertProject(): Promise<void> {
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
}

async function insertTask(assignedUserId: string | null = EMPLOYEE): Promise<string> {
  const [task] = await TaskModel.create([
    {
      projectId: PROJECT,
      title: 'Design creatives',
      status: 'todo',
      dueAt: new Date('2026-02-01T04:00:00.000Z'),
      assignedUserId: assignedUserId ? new mongoose.Types.ObjectId(assignedUserId) : null,
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

describe.skipIf(!hasTestDatabase)('task notification hooks', () => {
  beforeAll(async () => {
    await connectTestDatabase('notify_hooks');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await insertUser(EMPLOYEE, 'Employee One');
    await insertUser(MANAGER, 'Manager One');
    await insertProject();
    await updateNotificationSettings({ enabled: true }, ADMIN);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('records an assignment notification for the assignee', async () => {
    const taskId = await insertTask();

    const result = await notifyTaskAssignment(taskId, {
      recipientUserId: EMPLOYEE,
      previousAssigneeId: null,
    });

    expect(result?.inboxId).not.toBeNull();
    expect(result?.whatsappQueued).toBe(true);

    const inbox = await NotificationInboxModel.findOne().lean();
    expect(inbox?.eventType).toBe('task.assigned');
    expect(inbox?.body).toContain('Design creatives');
    expect(inbox?.body).toContain('Meta Ads Campaign');

    const outbox = await NotificationOutboxModel.findOne().lean();
    expect(outbox?.recipientRole).toBe('assignee');

    // Idempotent for the same task version and recipient.
    const again = await notifyTaskAssignment(taskId, {
      recipientUserId: EMPLOYEE,
      previousAssigneeId: null,
    });
    expect(again?.whatsappQueued).toBe(false);
    expect(await NotificationOutboxModel.countDocuments()).toBe(1);
  });

  it('records a reassignment when the previous assignee differs', async () => {
    const taskId = await insertTask();

    await notifyTaskAssignment(taskId, {
      recipientUserId: EMPLOYEE,
      previousAssigneeId: MANAGER,
    });

    const inbox = await NotificationInboxModel.findOne().lean();
    expect(inbox?.eventType).toBe('task.reassigned');
  });

  it('records a ready notification for a newly unblocked task', async () => {
    const taskId = await insertTask();

    await notifyTaskReady(taskId, EMPLOYEE);

    expect((await NotificationInboxModel.findOne().lean())?.eventType).toBe('task.ready');
  });

  it('records a revision request with the reason', async () => {
    const taskId = await insertTask();

    await notifyTaskRevisionRequested(taskId, EMPLOYEE, 'Update the headline copy');

    const inbox = await NotificationInboxModel.findOne().lean();
    expect(inbox?.eventType).toBe('task.revision_requested');
    expect(inbox?.body).toContain('Update the headline copy');
  });

  it('records deadline reminders and manager escalations', async () => {
    const taskId = await insertTask();
    const dueAt = new Date('2026-02-01T04:00:00.000Z');

    await notifyTaskDeadline(taskId, 'task.due_soon', EMPLOYEE, dueAt);
    await notifyTaskEscalation(taskId, MANAGER, dueAt);

    const events = (await NotificationInboxModel.find().lean()).map((row) => row.eventType).sort();
    expect(events).toEqual(['task.due_soon', 'task.overdue_escalation']);

    const escalation = await NotificationInboxModel.findOne({
      eventType: 'task.overdue_escalation',
    }).lean();
    expect(escalation?.recipientUserId.toString()).toBe(MANAGER);
  });

  it('suppresses outstanding WhatsApp reminders on a terminal transition', async () => {
    const taskId = await insertTask();
    await notifyTaskAssignment(taskId, { recipientUserId: EMPLOYEE, previousAssigneeId: null });
    await notifyTaskDeadline(
      taskId,
      'task.overdue',
      EMPLOYEE,
      new Date('2026-02-01T04:00:00.000Z'),
    );

    const suppressed = await suppressTaskOutstandingNotifications(taskId);
    expect(suppressed).toBe(2);

    const remaining = await NotificationOutboxModel.countDocuments({
      status: { $in: ['pending', 'retry_scheduled'] },
    });
    expect(remaining).toBe(0);

    // The in-app copies are preserved.
    expect(await NotificationInboxModel.countDocuments()).toBe(2);
  });
});
