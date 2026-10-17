import { z } from 'zod';
import { objectIdSchema } from './primitives';

/** Create a dependency edge: the successor waits on the prerequisite. */
export const createDependencyInputSchema = z.object({
  predecessorTaskId: objectIdSchema,
  confirmCompletedDependent: z.boolean().default(false),
});

export type CreateDependencyInput = z.infer<typeof createDependencyInputSchema>;

export const removeDependencyInputSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type RemoveDependencyInput = z.infer<typeof removeDependencyInputSchema>;

/** Stored dependency edge. */
export const taskDependencySchema = z.object({
  id: objectIdSchema,
  projectId: objectIdSchema,
  predecessorTaskId: objectIdSchema,
  successorTaskId: objectIdSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TaskDependency = z.infer<typeof taskDependencySchema>;

/** Enriched graph link with the other endpoint's title and status. */
export const dependencyLinkSchema = z.object({
  dependencyId: objectIdSchema,
  taskId: objectIdSchema,
  title: z.string(),
  status: z.string(),
  assignedUserId: objectIdSchema.nullable(),
});

export type DependencyLink = z.infer<typeof dependencyLinkSchema>;

/** Prerequisite satisfaction for one task. */
export const dependencyEvaluationSchema = z.object({
  satisfied: z.boolean(),
  pending: z.array(
    z.object({
      id: objectIdSchema,
      title: z.string(),
      status: z.string(),
    }),
  ),
});

export type DependencyEvaluation = z.infer<typeof dependencyEvaluationSchema>;

/** Derived blocker model (no seventh status anywhere). */
export const taskBlockersSchema = z.object({
  isBlocked: z.boolean(),
  manualReason: z.string().nullable(),
  waitingOn: z.array(
    z.object({
      id: objectIdSchema,
      title: z.string(),
      status: z.string(),
    }),
  ),
  needsAssignment: z.boolean(),
  reviewOpen: z.boolean(),
});

export type TaskBlockers = z.infer<typeof taskBlockersSchema>;

/** Durable, deduplicated readiness event (consumed by Phase 5). */
export const workflowEventSchema = z.object({
  id: objectIdSchema,
  taskId: objectIdSchema,
  projectId: objectIdSchema,
  clientId: objectIdSchema,
  assignedUserId: objectIdSchema.nullable(),
  version: z.number().int().min(0),
  type: z.literal('task.ready'),
  createdAt: z.string(),
});

export type WorkflowEvent = z.infer<typeof workflowEventSchema>;

/** Downstream impact review flag. */
export const dependencyReviewStatusSchema = z.enum(['open', 'resolved']);

export type DependencyReviewStatus = z.infer<typeof dependencyReviewStatusSchema>;

export const dependencyReviewSchema = z.object({
  id: objectIdSchema,
  taskId: objectIdSchema,
  upstreamTaskId: objectIdSchema,
  reason: z.string(),
  status: dependencyReviewStatusSchema,
  resolvedBy: objectIdSchema.nullable(),
  resolvedAt: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DependencyReview = z.infer<typeof dependencyReviewSchema>;

export const resolveReviewInputSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

export type ResolveReviewInput = z.infer<typeof resolveReviewInputSchema>;

/** Where an assignment came from (never random, never silent). */
export const assignmentSourceSchema = z.enum(['manual', 'role_mapping', 'template_override']);

export type AssignmentSource = z.infer<typeof assignmentSourceSchema>;
