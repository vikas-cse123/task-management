import { z } from 'zod';
import { assignmentSourceSchema } from './dependency';
import { DEFAULT_TASK_PRIORITY, TASK_PRIORITIES } from '../enums/task-priority';
import { TASK_STATUSES } from '../enums/task-status';
import { longTextSchema, objectIdSchema } from './primitives';
import { paginationQuerySchema } from './pagination';

const taskTitleSchema = z.string().trim().min(1).max(200);
const taskStatusSchema = z.enum(TASK_STATUSES);
const taskPrioritySchema = z.enum(TASK_PRIORITIES);

/** ISO-8601 datetime with offset (stored as UTC, displayed Asia/Kolkata). */
const dateTimeSchema = z.string().datetime({ offset: true });

const urlSchema = z.string().trim().url().max(2000);

const versionSchema = z.number().int().min(0).optional();

export const createTaskInputSchema = z.object({
  projectId: objectIdSchema,
  parentTaskId: objectIdSchema.nullable().default(null),
  title: taskTitleSchema,
  description: longTextSchema.nullable().default(null),
  assignedUserId: objectIdSchema.nullable().default(null),
  assignedJobRoleId: objectIdSchema.nullable().default(null),
  dueAt: dateTimeSchema.nullable().default(null),
  priority: taskPrioritySchema.default(DEFAULT_TASK_PRIORITY),
  approvalRequired: z.boolean().default(false),
  approverId: objectIdSchema.nullable().default(null),
  sopUrl: urlSchema.nullable().default(null),
  referenceUrl: urlSchema.nullable().default(null),
  sourceMeetingId: objectIdSchema.nullable().default(null),
  autoAssign: z.boolean().default(false),
  /** Explicit confirmation when adding a subtask to a completed parent. */
  confirmCompletedParent: z.boolean().default(false),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

/**
 * Subtask creation input.
 *
 * The project is inherited from the parent (same-project parenting is
 * enforced server-side), so `projectId`/`parentTaskId` are omitted here.
 */
export const createSubtaskInputSchema = createTaskInputSchema.omit({
  projectId: true,
  parentTaskId: true,
});

export type CreateSubtaskInput = z.infer<typeof createSubtaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: longTextSchema.nullable().optional(),
    assignedJobRoleId: objectIdSchema.nullable().optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    priority: taskPrioritySchema.optional(),
    approvalRequired: z.boolean().optional(),
    approverId: objectIdSchema.nullable().optional(),
    sopUrl: urlSchema.nullable().optional(),
    referenceUrl: urlSchema.nullable().optional(),
    autoAssign: z.boolean().optional(),
    expectedVersion: versionSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const assignTaskInputSchema = z.object({
  assignedUserId: objectIdSchema.nullable(),
  assignedJobRoleId: objectIdSchema.nullable(),
  expectedVersion: versionSchema,
});

export type AssignTaskInput = z.infer<typeof assignTaskInputSchema>;

/** Status-flow action body; `reason` is required by block/cancel/revise/reopen. */
export const taskActionInputSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(2000).optional(),
  expectedVersion: versionSchema,
});

export type TaskActionInput = z.infer<typeof taskActionInputSchema>;

export const taskActionReasonInputSchema = taskActionInputSchema.extend({
  reason: z.string().trim().min(1).max(2000),
});

export type TaskActionReasonInput = z.infer<typeof taskActionReasonInputSchema>;

export const taskDueFilterSchema = z.enum(['overdue', 'today', 'upcoming']);

export type TaskDueFilter = z.infer<typeof taskDueFilterSchema>;

export const taskListQuerySchema = paginationQuerySchema.extend({
  projectId: objectIdSchema.optional(),
  clientId: objectIdSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignedUserId: objectIdSchema.optional(),
  assignedJobRoleId: objectIdSchema.optional(),
  approverId: objectIdSchema.optional(),
  approvalRequired: z.coerce.boolean().optional(),
  due: taskDueFilterSchema.optional(),
  search: z.string().trim().max(200).optional(),
  unassignedOnly: z.coerce.boolean().optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

const nullableObjectId = objectIdSchema.nullable();
const nullableDateTime = z.string().nullable();

/** Sanitized task record with derived flags (never a seventh status). */
export const taskSummarySchema = z.object({
  id: objectIdSchema,
  projectId: objectIdSchema,
  parentTaskId: nullableObjectId,
  title: taskTitleSchema,
  description: z.string().nullable(),
  assignedUserId: nullableObjectId,
  assignedJobRoleId: nullableObjectId,
  dueAt: nullableDateTime,
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  approvalRequired: z.boolean(),
  approverId: nullableObjectId,
  submittedBy: nullableObjectId,
  submittedAt: nullableDateTime,
  approvedBy: nullableObjectId,
  approvedAt: nullableDateTime,
  completedAt: nullableDateTime,
  revisionCount: z.number().int().min(0),
  sopUrl: z.string().nullable(),
  referenceUrl: z.string().nullable(),
  sourceMeetingId: nullableObjectId,
  manualBlockReason: z.string().nullable(),
  autoAssign: z.boolean(),
  assignmentSource: assignmentSourceSchema.nullable(),
  version: z.number().int().min(0),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Derived: due and neither Done nor Cancelled. */
  isOverdue: z.boolean(),
  /** Derived: no valid assignee while actionable. */
  needsAssignment: z.boolean(),
});

export type TaskSummary = z.infer<typeof taskSummarySchema>;

/** Task detail with parent context and leaf progress (for parents). */
export const taskDetailSchema = taskSummarySchema.extend({
  parent: z
    .object({ id: objectIdSchema, title: taskTitleSchema, status: taskStatusSchema })
    .nullable(),
  progress: z.object({
    total: z.number().int().min(0),
    completed: z.number().int().min(0),
    percent: z.number().min(0).max(100),
  }),
});

export type TaskDetail = z.infer<typeof taskDetailSchema>;

/** Enriched row for My Tasks / approval queue (project, client, parent names). */
export const taskRowSchema = taskSummarySchema.extend({
  projectName: z.string(),
  clientName: z.string(),
  clientId: objectIdSchema,
  parentTitle: z.string().nullable(),
  reviewOpen: z.boolean(),
});

export type TaskRow = z.infer<typeof taskRowSchema>;

/** Assignment resolution outcome (preview or resolve). */
export const assignmentResolutionSchema = z.object({
  action: z.enum(['keep', 'assign', 'needs_manager']),
  employeeId: objectIdSchema.nullable(),
  source: assignmentSourceSchema.nullable(),
  reason: z.string().nullable(),
});

export type AssignmentResolution = z.infer<typeof assignmentResolutionSchema>;

/** Durable per-task activity entry (user-visible history). */
export const taskActivitySchema = z.object({
  id: objectIdSchema,
  taskId: objectIdSchema,
  actorId: objectIdSchema.nullable(),
  action: z.string().min(1),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export type TaskActivity = z.infer<typeof taskActivitySchema>;
