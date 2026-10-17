import { z } from 'zod';
import { MAX_REPEAT_INSTANCES } from '../enums/template';
import { JOB_ROLE_KEYS } from '../enums/job-role';
import { TASK_PRIORITIES } from '../enums/task-priority';
import { TASK_STATUSES } from '../enums/task-status';
import { objectIdSchema, shortTextSchema } from './primitives';
import { projectSummarySchema } from './project';
import { templateWarningSchema } from './template';

/** Creative deliverables a campaign may require. */
export const creativeTypeSchema = z.enum(['video', 'static', 'carousel']);

export type CreativeType = z.infer<typeof creativeTypeSchema>;

const dateTimeSchema = z.string().datetime({ offset: true });

/** Explicit, validated employee override for a functional role. */
export const roleOverrideSchema = z.object({
  jobRoleKey: z.enum(JOB_ROLE_KEYS),
  userId: objectIdSchema,
});

export type RoleOverride = z.infer<typeof roleOverrideSchema>;

/** Explicit, validated relative-deadline override for a template node. */
export const deadlineOverrideSchema = z.object({
  nodeKey: z.string().trim().min(1).max(60),
  dueAt: dateTimeSchema,
});

export type DeadlineOverride = z.infer<typeof deadlineOverrideSchema>;

/**
 * Deterministic project-generation input.
 *
 * The same payload with the same `idempotencyKey` replays the original result;
 * a different payload under the same key is a conflict.
 */
export const projectGenerationInputSchema = z.object({
  clientId: objectIdSchema,
  templateId: objectIdSchema,
  templateVersion: z.number().int().min(1).optional(),
  name: shortTextSchema.max(160),
  destination: z.string().trim().max(120).nullable().default(null),
  campaignName: z.string().trim().max(160).nullable().default(null),
  startAt: dateTimeSchema,
  targetAt: dateTimeSchema.nullable().default(null),
  managerId: objectIdSchema.nullable().default(null),
  videoAdCount: z.number().int().min(1).max(MAX_REPEAT_INSTANCES).default(1),
  creativeTypes: z.array(creativeTypeSchema).max(3).default(['video']),
  roleOverrides: z.array(roleOverrideSchema).max(50).default([]),
  deadlineOverrides: z.array(deadlineOverrideSchema).max(200).default([]),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type ProjectGenerationInput = z.infer<typeof projectGenerationInputSchema>;

/** One fully resolved node in the pre-creation preview. */
export const generatedNodePreviewSchema = z.object({
  nodeKey: z.string(),
  templateNodeKey: z.string(),
  parentNodeKey: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  requiredJobRoleKey: z.enum(JOB_ROLE_KEYS).nullable(),
  jobRoleId: objectIdSchema.nullable(),
  assignedUserId: objectIdSchema.nullable(),
  approvalRequired: z.boolean(),
  approverId: objectIdSchema.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.string().nullable(),
  initialStatus: z.enum(TASK_STATUSES),
  isRequired: z.boolean(),
  repeatGroup: z.string().nullable(),
  repeatIndex: z.number().int().min(1).nullable(),
  deadlineWarning: z.string().nullable(),
});

export type GeneratedNodePreview = z.infer<typeof generatedNodePreviewSchema>;

/** Server-validated preview built from the exact expansion used at creation. */
export const projectGenerationPreviewSchema = z.object({
  clientId: objectIdSchema,
  clientName: z.string(),
  templateId: objectIdSchema,
  templateKey: z.string(),
  templateName: z.string(),
  templateVersion: z.number().int().min(1),
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  destination: z.string().nullable(),
  startAt: z.string(),
  targetAt: z.string().nullable(),
  managerId: objectIdSchema.nullable(),
  tasks: z.array(generatedNodePreviewSchema),
  dependencies: z.array(
    z.object({
      predecessorNodeKey: z.string(),
      successorNodeKey: z.string(),
    }),
  ),
  warnings: z.array(templateWarningSchema),
});

export type ProjectGenerationPreview = z.infer<typeof projectGenerationPreviewSchema>;

/** Result of an atomic template instantiation. */
export const projectGenerationResultSchema = z.object({
  project: projectSummarySchema,
  templateId: objectIdSchema,
  templateVersion: z.number().int().min(1),
  taskCount: z.number().int().min(0),
  subtaskCount: z.number().int().min(0),
  dependencyCount: z.number().int().min(0),
  warnings: z.array(templateWarningSchema),
  idempotentReplay: z.boolean(),
});

export type ProjectGenerationResult = z.infer<typeof projectGenerationResultSchema>;

/** Preview request: everything except the idempotency key is required. */
export const projectGenerationPreviewInputSchema = projectGenerationInputSchema.omit({
  idempotencyKey: true,
});

export type ProjectGenerationPreviewInput = z.infer<typeof projectGenerationPreviewInputSchema>;
