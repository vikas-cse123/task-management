import { z } from 'zod';
import { ACCESS_LEVELS } from '../enums/access-level';
import { USER_STATUSES } from '../enums/user-status';
import { capabilitySchema } from '../permissions/capabilities';
import { emailSchema, nonEmptyStringSchema, objectIdSchema, phoneE164Schema } from './primitives';
import { userProfileSchema } from './user';

/**
 * Employee (user-admin) contracts — Step 4.
 *
 * Account administration is Admin-only and performed server-side; these
 * schemas validate the request payloads only. Application profile values are
 * never client-writable outside these Admin endpoints.
 */

export const MAX_NAME_LENGTH = 120;
export const MAX_JOB_ROLES_PER_EMPLOYEE = 20;

export const employeeNameSchema = z.string().trim().min(1, 'Name is required').max(MAX_NAME_LENGTH);

/** List/query filters for the employee directory. */
export const employeeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: objectIdSchema.optional(),
  search: z.string().trim().max(160).optional(),
  status: z.enum(USER_STATUSES).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).optional(),
  jobRoleId: objectIdSchema.optional(),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

/** Create an employee. The server generates the temporary password. */
export const createEmployeeInputSchema = z.object({
  name: employeeNameSchema,
  email: emailSchema,
  accessLevel: z.enum(ACCESS_LEVELS).default('Employee'),
  jobRoleIds: z.array(objectIdSchema).max(MAX_JOB_ROLES_PER_EMPLOYEE).default([]),
  capabilities: z.array(capabilitySchema).max(20).default([]),
  whatsappNumber: phoneE164Schema.nullable().optional(),
  whatsappOptIn: z.boolean().default(false),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;

/**
 * Update permitted employee details.
 *
 * At least one field must be provided. Access level, status, job roles and
 * capabilities are separate audit actions; name and WhatsApp fields are part
 * of the general update.
 */
export const updateEmployeeInputSchema = z
  .object({
    name: employeeNameSchema.optional(),
    accessLevel: z.enum(ACCESS_LEVELS).optional(),
    status: z.enum(USER_STATUSES).optional(),
    jobRoleIds: z.array(objectIdSchema).max(MAX_JOB_ROLES_PER_EMPLOYEE).optional(),
    capabilities: z.array(capabilitySchema).max(20).optional(),
    whatsappNumber: phoneE164Schema.nullable().optional(),
    whatsappOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;

/** Response of a create: the sanitized profile plus the one-time password. */
export const employeeCreatedSchema = z.object({
  user: userProfileSchema,
  temporaryPassword: z.string().min(1),
});

export type EmployeeCreated = z.infer<typeof employeeCreatedSchema>;

export const sessionRevocationResultSchema = z.object({
  revoked: z.number().int().min(0),
});

/** Seeded organizational department reference data. */
export const departmentSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Department = z.infer<typeof departmentSchema>;

/** Seeded functional job-role reference data. */
export const jobRoleSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  departmentId: z.string().min(1),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobRole = z.infer<typeof jobRoleSchema>;

/**
 * Admins may edit only the display name and description of seeded reference
 * data; keys and relationships are immutable.
 */
export const updateReferenceLabelSchema = z
  .object({
    name: nonEmptyStringSchema.max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateReferenceLabel = z.infer<typeof updateReferenceLabelSchema>;
