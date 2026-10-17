import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CampaignReviewOccurrenceModel,
  CampaignReviewScheduleModel,
  NotificationInboxModel,
  TaskModel,
  ensureCampaignReviewSchedule,
  runDueCampaignReviews,
  scanTaskDeadlines,
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

async function insertProject(managerId: string | null = MANAGER): Promise<void> {
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
    managerId: managerId ? new mongoose.Types.ObjectId(managerId) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertTask(options: {
  dueAt: Date;
  assignedUserId?: string;
  status?: 'todo' | 'done';
}): Promise<string> {
  const [task] = await TaskModel.create([
    {
      projectId: PROJECT,
      title: 'Design creatives',
      status: options.status ?? 'todo',
      dueAt: options.dueAt,
      assignedUserId: new mongoose.Types.ObjectId(options.assignedUserId ?? EMPLOYEE),
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

describe.skipIf(!hasTestDatabase)('notification jobs', () => {
  beforeAll(async () => {
    await connectTestDatabase('notify_jobs');
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

  it('enqueues due-soon and overdue reminders for open tasks', async () => {
    const now = new Date('2026-02-01T12:00:00.000Z');
    await insertTask({ dueAt: new Date('2026-02-01T20:00:00.000Z') });
    await insertTask({ dueAt: new Date('2026-02-01T10:00:00.000Z') });

    const summary = await scanTaskDeadlines({
      now,
      dueSoonLeadHours: 24,
      escalationAfterHours: 24,
    });

    expect(summary.dueSoon).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.escalated).toBe(0);

    const events = (await NotificationInboxModel.find().lean()).map((row) => row.eventType).sort();
    expect(events).toEqual(['task.due_soon', 'task.overdue']);
  });

  it('escalates a long-overdue task to the project manager', async () => {
    const now = new Date('2026-02-02T12:00:00.000Z');
    await insertTask({ dueAt: new Date('2026-02-01T10:00:00.000Z') });

    const summary = await scanTaskDeadlines({
      now,
      dueSoonLeadHours: 24,
      escalationAfterHours: 24,
    });

    expect(summary.escalated).toBe(1);
    const escalation = await NotificationInboxModel.findOne({
      eventType: 'task.overdue_escalation',
    }).lean();
    expect(escalation?.recipientUserId.toString()).toBe(MANAGER);
  });

  it('is idempotent across repeated scans', async () => {
    const now = new Date('2026-02-01T12:00:00.000Z');
    await insertTask({ dueAt: new Date('2026-02-01T20:00:00.000Z') });

    await scanTaskDeadlines({ now, dueSoonLeadHours: 24, escalationAfterHours: 24 });
    const second = await scanTaskDeadlines({
      now,
      dueSoonLeadHours: 24,
      escalationAfterHours: 24,
    });

    expect(second.dueSoon).toBe(0);
    expect(await NotificationInboxModel.countDocuments()).toBe(1);
  });

  it('generates each campaign-review period exactly once', async () => {
    const anchor = new Date('2026-02-01T03:30:00.000Z');
    await ensureCampaignReviewSchedule({
      projectId: PROJECT.toString(),
      clientId: CLIENT.toString(),
      anchorAt: anchor,
      intervalDays: 7,
      createdBy: ADMIN,
    });

    const now = new Date('2026-02-03T00:00:00.000Z');
    const first = await runDueCampaignReviews({ now });
    expect(first.generated).toBe(1);
    expect(first.notified).toBe(1);
    expect(await CampaignReviewOccurrenceModel.countDocuments()).toBe(1);

    const schedule = await CampaignReviewScheduleModel.findOne().lean();
    expect(schedule?.nextRunAt.getTime()).toBeGreaterThan(now.getTime());

    const second = await runDueCampaignReviews({ now });
    expect(second.generated).toBe(0);
    expect(await CampaignReviewOccurrenceModel.countDocuments()).toBe(1);
  });

  it('creates one schedule per project idempotently', async () => {
    const anchor = new Date('2026-02-01T03:30:00.000Z');
    const input = {
      projectId: PROJECT.toString(),
      clientId: CLIENT.toString(),
      anchorAt: anchor,
      intervalDays: 7,
      createdBy: ADMIN,
    };

    await ensureCampaignReviewSchedule(input);
    await ensureCampaignReviewSchedule(input);

    expect(await CampaignReviewScheduleModel.countDocuments()).toBe(1);
  });
});
