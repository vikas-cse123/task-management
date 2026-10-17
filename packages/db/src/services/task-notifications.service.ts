import { type NotificationEventType, type TemplateParameterValues } from '@interscale/shared';
import mongoose from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';
import { formatIstDate } from '../lib/deadlines';
import { ClientModel } from '../models/client';
import { ProjectModel } from '../models/project';
import { TaskModel } from '../models/task';
import {
  buildCampaignReviewEventKey,
  buildTaskAssignmentEventKey,
  buildTaskDeadlineEventKey,
  enqueueNotification,
  suppressTaskNotifications,
  type EnqueueNotificationResult,
  type NotificationServiceOptions,
} from './notification.service';

/**
 * Business-flow notification hooks (Phase 5, Step 27).
 *
 * These helpers translate a business change (a task assignment, an approval, a
 * deadline reminder) into a durable notification intent. They are called from
 * the domain services **inside the same transaction** as the change, so the
 * intent is never lost and never sent before the change commits.
 *
 * No message is sent here: the outbox is dispatched later by the worker, which
 * revalidates the live state (consent, assignment, deadline) before sending.
 */

export type TaskNotificationOptions = NotificationServiceOptions;

interface TaskNotificationContext {
  taskId: string;
  projectId: string;
  clientId: string | null;
  title: string;
  dueAt: Date | null;
  version: number;
  projectName: string;
  clientName: string;
}

function collectionFor(options: NotificationServiceOptions) {
  return (options.connection ?? getConnection()).collection(BETTER_AUTH_USER_COLLECTION);
}

async function loadUserName(userId: string, options: NotificationServiceOptions): Promise<string> {
  const id = assertObjectId(userId, 'user');

  const document = await collectionFor(options).findOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { projection: { name: 1 } },
  );

  return document && typeof document.name === 'string' ? document.name : '';
}

async function loadTaskContext(
  taskId: string,
  options: NotificationServiceOptions,
): Promise<TaskNotificationContext | null> {
  const session = options.session ?? null;
  const task = await TaskModel.findById(assertObjectId(taskId, 'task')).session(session).lean();

  if (!task) {
    return null;
  }

  let projectName = '';
  let clientName = '';
  let clientId: string | null = null;

  const project = await ProjectModel.findById(task.projectId).session(session).lean();

  if (project) {
    projectName = project.name;
    clientId = project.clientId ? project.clientId.toString() : null;

    if (project.clientId) {
      const client = await ClientModel.findById(project.clientId).session(session).lean();
      clientName = client?.name ?? '';
    }
  }

  return {
    taskId: task._id.toString(),
    projectId: task.projectId.toString(),
    clientId,
    title: task.title,
    dueAt: task.dueAt ?? null,
    version: (task as unknown as { __v?: number }).__v ?? 0,
    projectName,
    clientName,
  };
}

function taskValues(
  context: TaskNotificationContext,
  recipientName: string,
  deadline: Date | null,
): TemplateParameterValues {
  return {
    employee_name: recipientName,
    task_title: context.title,
    project_name: context.projectName,
    client_name: context.clientName,
    due_date: deadline ? formatIstDate(deadline) : '',
    url: `/tasks/${context.taskId}`,
  };
}

export interface TaskAssignmentNotificationInput {
  recipientUserId: string;
  /** The assignee before the change (`null` for a first assignment). */
  previousAssigneeId: string | null;
}

/**
 * Record an assignment (or reassignment) intent for the new assignee.
 *
 * Keyed by the task version so each distinct assignment is de-duplicated, while
 * a later reassignment at a new version still produces a fresh notification.
 */
export async function notifyTaskAssignment(
  taskId: string,
  input: TaskAssignmentNotificationInput,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadTaskContext(taskId, options);

  if (!context) {
    return null;
  }

  const eventType: NotificationEventType = input.previousAssigneeId
    ? 'task.reassigned'
    : 'task.assigned';
  const recipientName = await loadUserName(input.recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildTaskAssignmentEventKey(
        eventType,
        context.taskId,
        context.version,
        input.recipientUserId,
      ),
      eventType,
      category: 'task',
      recipientUserId: input.recipientUserId,
      recipientRole: 'assignee',
      taskId: context.taskId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: taskValues(context, recipientName, context.dueAt),
      url: `/tasks/${context.taskId}`,
      assignedUserId: input.recipientUserId,
    },
    options,
  );
}

/** Record a "ready to start" intent for the assignee of a newly unblocked task. */
export async function notifyTaskReady(
  taskId: string,
  recipientUserId: string,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadTaskContext(taskId, options);

  if (!context) {
    return null;
  }

  const recipientName = await loadUserName(recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildTaskAssignmentEventKey(
        'task.ready',
        context.taskId,
        context.version,
        recipientUserId,
      ),
      eventType: 'task.ready',
      category: 'task',
      recipientUserId,
      recipientRole: 'assignee',
      taskId: context.taskId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: taskValues(context, recipientName, context.dueAt),
      url: `/tasks/${context.taskId}`,
      assignedUserId: recipientUserId,
    },
    options,
  );
}

/** Record a revision-requested intent for the assignee. */
export async function notifyTaskRevisionRequested(
  taskId: string,
  recipientUserId: string,
  reason: string,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadTaskContext(taskId, options);

  if (!context) {
    return null;
  }

  const recipientName = await loadUserName(recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildTaskAssignmentEventKey(
        'task.revision_requested',
        context.taskId,
        context.version,
        recipientUserId,
      ),
      eventType: 'task.revision_requested',
      category: 'task',
      recipientUserId,
      recipientRole: 'assignee',
      taskId: context.taskId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: {
        ...taskValues(context, recipientName, context.dueAt),
        reason: reason.trim().length > 0 ? reason : 'Please review the requested changes',
      },
      url: `/tasks/${context.taskId}`,
      assignedUserId: recipientUserId,
    },
    options,
  );
}

export type DeadlineEventType = 'task.due_soon' | 'task.overdue';

/**
 * Record a deadline reminder intent (worker-driven, Step 28).
 *
 * The deadline is captured in both the event key and the payload, so the
 * dispatcher can detect a deadline change and suppress a stale reminder.
 */
export async function notifyTaskDeadline(
  taskId: string,
  eventType: DeadlineEventType,
  recipientUserId: string,
  deadlineAt: Date,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadTaskContext(taskId, options);

  if (!context) {
    return null;
  }

  const recipientName = await loadUserName(recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildTaskDeadlineEventKey(eventType, context.taskId, deadlineAt, recipientUserId),
      eventType,
      category: 'deadline',
      recipientUserId,
      recipientRole: 'assignee',
      taskId: context.taskId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: taskValues(context, recipientName, deadlineAt),
      url: `/tasks/${context.taskId}`,
      assignedUserId: recipientUserId,
      deadlineAt,
    },
    options,
  );
}

/** Record an overdue escalation intent for a manager. */
export async function notifyTaskEscalation(
  taskId: string,
  managerUserId: string,
  deadlineAt: Date,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadTaskContext(taskId, options);

  if (!context) {
    return null;
  }

  const recipientName = await loadUserName(managerUserId, options);

  return enqueueNotification(
    {
      eventKey: buildTaskDeadlineEventKey(
        'task.overdue_escalation',
        context.taskId,
        deadlineAt,
        managerUserId,
      ),
      eventType: 'task.overdue_escalation',
      category: 'escalation',
      recipientUserId: managerUserId,
      recipientRole: 'manager',
      taskId: context.taskId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: taskValues(context, recipientName, deadlineAt),
      url: `/tasks/${context.taskId}`,
      deadlineAt,
    },
    options,
  );
}

export interface CampaignReviewNotificationInput {
  projectId: string;
  periodKey: string;
  periodLabel: string;
  recipientUserId: string;
}

/** Record a weekly campaign-review-due intent for the project manager. */
export async function notifyCampaignReviewDue(
  input: CampaignReviewNotificationInput,
  options: TaskNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const projectId = assertObjectId(input.projectId, 'project');
  const project = await ProjectModel.findById(projectId).lean();

  if (!project) {
    return null;
  }

  let clientName = '';

  if (project.clientId) {
    const client = await ClientModel.findById(project.clientId).lean();
    clientName = client?.name ?? '';
  }

  const recipientName = await loadUserName(input.recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildCampaignReviewEventKey(
        input.projectId,
        input.periodKey,
        input.recipientUserId,
      ),
      eventType: 'campaign.review_due',
      category: 'deadline',
      recipientUserId: input.recipientUserId,
      recipientRole: 'manager',
      projectId: input.projectId,
      clientId: project.clientId ? project.clientId.toString() : null,
      templateValues: {
        employee_name: recipientName,
        project_name: project.name,
        client_name: clientName,
        review_period: input.periodLabel,
        url: `/projects/${input.projectId}`,
      },
      url: `/projects/${input.projectId}`,
    },
    options,
  );
}

/**
 * Cancel every outstanding WhatsApp intent for a task (terminal transition).
 *
 * The in-app copies are intentionally preserved: the history stays, but the
 * WhatsApp reminders that are no longer actionable are suppressed.
 */
export async function suppressTaskOutstandingNotifications(
  taskId: string,
  options: TaskNotificationOptions = {},
): Promise<number> {
  return suppressTaskNotifications(taskId, 'task_no_longer_actionable', null, options);
}
