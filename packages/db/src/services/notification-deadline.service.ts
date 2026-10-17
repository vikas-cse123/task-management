import { TERMINAL_TASK_STATUSES } from '@interscale/shared';
import type mongoose from 'mongoose';
import { ProjectModel } from '../models/project';
import { TaskModel } from '../models/task';
import { notifyTaskDeadline, notifyTaskEscalation } from './task-notifications.service';
import type { NotificationServiceOptions } from './notification.service';

/**
 * Deadline reminder scanning (Phase 5, Step 28).
 *
 * The worker asks this service which open tasks have a deadline worth
 * notifying, and the service records the durably-deduplicated intent. It never
 * sends anything: the outbox dispatcher does that, revalidating the deadline
 * and task state first.
 *
 * Only tasks with an assignee and a deadline are considered, and terminal tasks
 * are ignored. Every intent is keyed by the task, the exact deadline and the
 * recipient, so repeated scans (and multiple workers) cannot duplicate a
 * reminder.
 */

/** Safety cap so one scan can never enqueue an unbounded number of intents. */
export const DEADLINE_SCAN_BATCH_LIMIT = 500;

export interface DeadlineScanInput {
  now?: Date;
  dueSoonLeadHours: number;
  escalationAfterHours: number;
}

export interface DeadlineScanSummary {
  dueSoon: number;
  overdue: number;
  escalated: number;
}

interface OpenTaskRow {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  assignedUserId: mongoose.Types.ObjectId | null;
  dueAt: Date | null;
}

async function loadOpenTasks(filter: Record<string, unknown>): Promise<OpenTaskRow[]> {
  return TaskModel.find({
    status: { $nin: [...TERMINAL_TASK_STATUSES] },
    assignedUserId: { $ne: null },
    dueAt: { $ne: null },
    ...filter,
  })
    .sort({ dueAt: 1 })
    .limit(DEADLINE_SCAN_BATCH_LIMIT)
    .select({ projectId: 1, assignedUserId: 1, dueAt: 1 })
    .lean<OpenTaskRow[]>();
}

export async function scanTaskDeadlines(
  input: DeadlineScanInput,
  options: NotificationServiceOptions = {},
): Promise<DeadlineScanSummary> {
  const now = input.now ?? new Date();
  const leadMs = input.dueSoonLeadHours * 60 * 60 * 1000;
  const escalationMs = input.escalationAfterHours * 60 * 60 * 1000;

  const summary: DeadlineScanSummary = { dueSoon: 0, overdue: 0, escalated: 0 };

  const dueSoonTasks = await loadOpenTasks({
    dueAt: { $gt: now, $lte: new Date(now.getTime() + leadMs) },
  });

  for (const task of dueSoonTasks) {
    if (!task.dueAt || !task.assignedUserId) {
      continue;
    }

    const result = await notifyTaskDeadline(
      task._id.toString(),
      'task.due_soon',
      task.assignedUserId.toString(),
      task.dueAt,
      options,
    );

    if (result?.created) {
      summary.dueSoon += 1;
    }
  }

  const overdueTasks = await loadOpenTasks({ dueAt: { $lte: now } });
  const managerCache = new Map<string, string | null>();

  async function projectManagerId(projectId: string): Promise<string | null> {
    if (managerCache.has(projectId)) {
      return managerCache.get(projectId) ?? null;
    }

    const project = await ProjectModel.findById(projectId).select({ managerId: 1 }).lean();
    const managerId = project?.managerId ? project.managerId.toString() : null;
    managerCache.set(projectId, managerId);
    return managerId;
  }

  for (const task of overdueTasks) {
    if (!task.dueAt || !task.assignedUserId) {
      continue;
    }

    const taskId = task._id.toString();
    const recipientUserId = task.assignedUserId.toString();
    const deadlineAt = task.dueAt;

    const overdue = await notifyTaskDeadline(
      taskId,
      'task.overdue',
      recipientUserId,
      deadlineAt,
      options,
    );

    if (overdue?.created) {
      summary.overdue += 1;
    }

    const escalationDue = deadlineAt.getTime() + escalationMs <= now.getTime();

    if (!escalationDue) {
      continue;
    }

    const managerId = await projectManagerId(task.projectId.toString());

    if (!managerId || managerId === recipientUserId) {
      continue;
    }

    const escalated = await notifyTaskEscalation(taskId, managerId, deadlineAt, options);

    if (escalated?.created) {
      summary.escalated += 1;
    }
  }

  return summary;
}
