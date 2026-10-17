import { z } from 'zod';
import { JOB_ROLE_KEYS } from '../enums/job-role';
import { DEFAULT_TASK_PRIORITY, TASK_PRIORITIES } from '../enums/task-priority';
import {
  DEADLINE_ANCHORS,
  DEFAULT_DEADLINE_ANCHOR,
  DEFAULT_DEADLINE_TIME_OF_DAY,
  DEFAULT_TEMPLATE_APPROVER_RULE,
  DEFAULT_TEMPLATE_ASSIGNMENT_RULE,
  DEFAULT_TEMPLATE_TYPE,
  TEMPLATE_APPROVER_RULES,
  TEMPLATE_ASSIGNMENT_RULES,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES,
  TEMPLATE_VARIABLE_KEYS,
  TEMPLATE_VERSION_STATUSES,
} from '../enums/template';
import { longTextSchema, objectIdSchema, shortTextSchema } from './primitives';
import { paginationQuerySchema } from './pagination';

/** Local `HH:mm` time of day used by calendar-day deadline rules. */
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Stable internal identifiers: lowercase snake_case, never display names. */
const stableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use lowercase letters, digits and underscores, starting with a letter',
  );

const urlSchema = z.string().trim().url().max(2000);
const templateNameSchema = shortTextSchema.max(160);
const templateVariableSchema = z.enum(TEMPLATE_VARIABLE_KEYS);

/** Configurable relative deadline rule (timezone-aware, calendar days). */
export const relativeDueRuleSchema = z.object({
  anchor: z.enum(DEADLINE_ANCHORS).default(DEFAULT_DEADLINE_ANCHOR),
  offsetDays: z.number().int().min(0).max(365),
  timeOfDay: z.string().regex(TIME_OF_DAY_PATTERN).default(DEFAULT_DEADLINE_TIME_OF_DAY),
});

export type RelativeDueRule = z.infer<typeof relativeDueRuleSchema>;

/** A reusable task/subtask definition (one level of nesting only). */
export const templateNodeInputSchema = z.object({
  nodeKey: stableKeySchema,
  parentNodeKey: stableKeySchema.nullable().default(null),
  titleTemplate: z.string().trim().min(1).max(200),
  descriptionTemplate: longTextSchema.nullable().default(null),
  requiredJobRoleKey: z.enum(JOB_ROLE_KEYS).nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default(DEFAULT_TASK_PRIORITY),
  approvalRequired: z.boolean().default(false),
  approverResolutionRule: z.enum(TEMPLATE_APPROVER_RULES).default(DEFAULT_TEMPLATE_APPROVER_RULE),
  assignmentRule: z.enum(TEMPLATE_ASSIGNMENT_RULES).default(DEFAULT_TEMPLATE_ASSIGNMENT_RULE),
  relativeDueRule: relativeDueRuleSchema.nullable().default(null),
  isRequired: z.boolean().default(true),
  /**
   * Optional repeat group. Nodes sharing a group are duplicated once per
   * instance (e.g. one per video ad). `null` means a single instance.
   */
  repeatGroup: stableKeySchema.nullable().default(null),
  sopUrl: urlSchema.nullable().default(null),
  referenceUrl: urlSchema.nullable().default(null),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export type TemplateNodeInput = z.infer<typeof templateNodeInputSchema>;

/** Template prerequisite edge: the successor waits on the predecessor. */
export const templateDependencyInputSchema = z.object({
  predecessorNodeKey: stableKeySchema,
  successorNodeKey: stableKeySchema,
});

export type TemplateDependencyInput = z.infer<typeof templateDependencyInputSchema>;

/** Full editable content of one template version. */
export const templateDraftInputSchema = z.object({
  nodes: z.array(templateNodeInputSchema).max(200).default([]),
  dependencies: z.array(templateDependencyInputSchema).max(500).default([]),
});

export type TemplateDraftInput = z.infer<typeof templateDraftInputSchema>;

export const createTemplateInputSchema = z.object({
  key: stableKeySchema,
  name: templateNameSchema,
  description: longTextSchema.nullable().default(null),
  type: z.enum(TEMPLATE_TYPES).default(DEFAULT_TEMPLATE_TYPE),
  draft: templateDraftInputSchema.optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateInputSchema>;

export const updateTemplateInputSchema = z
  .object({
    name: templateNameSchema.optional(),
    description: longTextSchema.nullable().optional(),
    type: z.enum(TEMPLATE_TYPES).optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;

export const templateListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TEMPLATE_STATUSES).optional(),
  type: z.enum(TEMPLATE_TYPES).optional(),
  search: z.string().trim().max(160).optional(),
});

export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;

export const publishTemplateInputSchema = z.object({
  /** Draft version to publish; defaults to the current draft. */
  version: z.number().int().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type PublishTemplateInput = z.infer<typeof publishTemplateInputSchema>;

export const archiveTemplateInputSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export type ArchiveTemplateInput = z.infer<typeof archiveTemplateInputSchema>;

/** A variable that appears in a node's title/description templates. */
export const templateVariableReferenceSchema = z.object({
  nodeKey: z.string(),
  variable: templateVariableSchema,
});

export type TemplateVariableReference = z.infer<typeof templateVariableReferenceSchema>;

/** Non-fatal publish/creation warnings surfaced to the Manager. */
export const templateWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  nodeKey: z.string().nullable().default(null),
});

export type TemplateWarning = z.infer<typeof templateWarningSchema>;

export const templateValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  nodeKey: z.string().nullable().default(null),
});

export type TemplateValidationIssue = z.infer<typeof templateValidationIssueSchema>;

export const templateValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(templateValidationIssueSchema),
});

export type TemplateValidationResult = z.infer<typeof templateValidationResultSchema>;

/** Sanitized template record returned by the API. */
export const templateSummarySchema = z.object({
  id: objectIdSchema,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(TEMPLATE_TYPES),
  status: z.enum(TEMPLATE_STATUSES),
  currentPublishedVersion: z.number().int().min(1).nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  taskDefinitionCount: z.number().int().min(0),
});

export type TemplateSummary = z.infer<typeof templateSummarySchema>;

export const templateVersionSummarySchema = z.object({
  id: objectIdSchema,
  templateId: objectIdSchema,
  version: z.number().int().min(1),
  status: z.enum(TEMPLATE_VERSION_STATUSES),
  notes: z.string().nullable(),
  basedOnVersion: z.number().int().min(1).nullable(),
  nodeCount: z.number().int().min(0),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  publishedBy: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TemplateVersionSummary = z.infer<typeof templateVersionSummarySchema>;

/** A node as returned to the editor (identity is the version-scoped key). */
export const templateNodeViewSchema = z.object({
  nodeKey: z.string(),
  parentNodeKey: z.string().nullable(),
  titleTemplate: z.string(),
  descriptionTemplate: z.string().nullable(),
  requiredJobRoleKey: z.enum(JOB_ROLE_KEYS).nullable(),
  priority: z.enum(TASK_PRIORITIES),
  approvalRequired: z.boolean(),
  approverResolutionRule: z.enum(TEMPLATE_APPROVER_RULES),
  assignmentRule: z.enum(TEMPLATE_ASSIGNMENT_RULES),
  relativeDueRule: relativeDueRuleSchema.nullable(),
  isRequired: z.boolean(),
  repeatGroup: z.string().nullable(),
  sopUrl: z.string().nullable(),
  referenceUrl: z.string().nullable(),
  sortOrder: z.number().int().min(0),
});

export type TemplateNodeView = z.infer<typeof templateNodeViewSchema>;

export const templateVersionDetailSchema = templateVersionSummarySchema.extend({
  nodes: z.array(templateNodeViewSchema),
  dependencies: z.array(templateDependencyInputSchema),
});

export type TemplateVersionDetail = z.infer<typeof templateVersionDetailSchema>;

export const templateDetailSchema = templateSummarySchema.extend({
  versions: z.array(templateVersionSummarySchema),
  draftVersion: z.number().int().min(1).nullable(),
  draftNodeCount: z.number().int().min(0),
});

export type TemplateDetail = z.infer<typeof templateDetailSchema>;
