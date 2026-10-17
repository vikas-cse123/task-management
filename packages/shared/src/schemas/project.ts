import { z } from 'zod';
import { DEFAULT_PROJECT_STATUS, PROJECT_STATUSES } from '../enums/project-status';
import { PROJECT_TYPES } from '../enums/project-type';
import { longTextSchema, objectIdSchema, shortTextSchema } from './primitives';
import { paginationQuerySchema } from './pagination';

const projectNameSchema = shortTextSchema.max(160);
const projectStatusSchema = z.enum(PROJECT_STATUSES);
const projectTypeSchema = z.enum(PROJECT_TYPES);

/** ISO-8601 datetime, nullable for unset dates. */
const dateTimeSchema = z.string().datetime({ offset: true });

/** Template reference reserved for Phase 4 (accepted, stored, never acted on). */
const templateReferenceSchema = z.object({
  templateId: objectIdSchema.nullable().default(null),
  templateVersion: z.number().int().min(1).nullable().default(null),
});

export const createProjectInputSchema = z.object({
  clientId: objectIdSchema,
  name: projectNameSchema,
  description: longTextSchema.nullable().default(null),
  type: projectTypeSchema,
  status: projectStatusSchema.default(DEFAULT_PROJECT_STATUS),
  managerId: objectIdSchema.nullable().default(null),
  startAt: dateTimeSchema.nullable().default(null),
  targetAt: dateTimeSchema.nullable().default(null),
  template: templateReferenceSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: projectNameSchema.optional(),
    description: longTextSchema.nullable().optional(),
    type: projectTypeSchema.optional(),
    managerId: objectIdSchema.nullable().optional(),
    startAt: dateTimeSchema.nullable().optional(),
    targetAt: dateTimeSchema.nullable().optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const changeProjectStatusInputSchema = z.object({
  status: projectStatusSchema,
  reason: z.string().trim().max(2000).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusInputSchema>;

export const projectListQuerySchema = paginationQuerySchema.extend({
  clientId: objectIdSchema.optional(),
  status: projectStatusSchema.optional(),
  type: projectTypeSchema.optional(),
  managerId: objectIdSchema.optional(),
  search: z.string().trim().max(160).optional(),
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

/** Sanitized project record returned by the API. */
export const projectSummarySchema = z.object({
  id: objectIdSchema,
  clientId: objectIdSchema,
  name: projectNameSchema,
  description: z.string().nullable(),
  type: projectTypeSchema,
  status: projectStatusSchema,
  managerId: objectIdSchema.nullable(),
  startAt: z.string().nullable(),
  targetAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectProgressSchema = z.object({
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
  percent: z.number().min(0).max(100),
});

export type ProjectProgress = z.infer<typeof projectProgressSchema>;

/** Project detail with server-computed leaf-task progress (Step 11 screens). */
export const projectDetailSchema = projectSummarySchema.extend({
  progress: projectProgressSchema,
});

export type ProjectDetail = z.infer<typeof projectDetailSchema>;
