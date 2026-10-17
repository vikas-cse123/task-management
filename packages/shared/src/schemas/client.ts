import { z } from 'zod';
import { CLIENT_STATUSES, DEFAULT_CLIENT_STATUS } from '../enums/client-status';
import { CLIENT_TEAM_ROLES } from '../enums/client-team-role';
import { objectIdSchema, shortTextSchema } from './primitives';
import { paginationQuerySchema } from './pagination';
import { clientTeamMemberInputSchema } from './client-team';

const clientNameSchema = shortTextSchema.max(160);

const clientStatusSchema = z.enum(CLIENT_STATUSES);

/** A client reference to the responsible primary Manager (Better Auth user id). */
const primaryManagerIdSchema = objectIdSchema.nullable();

export const createClientInputSchema = z.object({
  name: clientNameSchema,
  status: clientStatusSchema.default(DEFAULT_CLIENT_STATUS),
  primaryManagerId: primaryManagerIdSchema.optional(),
});

export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export const updateClientInputSchema = z
  .object({
    name: clientNameSchema.optional(),
    status: clientStatusSchema.optional(),
    primaryManagerId: primaryManagerIdSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

/** Query for listing clients with filters and cursor pagination. */
export const clientListQuerySchema = paginationQuerySchema.extend({
  status: clientStatusSchema.optional(),
  search: z.string().trim().max(160).optional(),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

/** Sanitized client record returned by the API. */
export const clientSummarySchema = z.object({
  id: objectIdSchema,
  name: clientNameSchema,
  status: clientStatusSchema,
  primaryManagerId: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ClientSummary = z.infer<typeof clientSummarySchema>;

/** Sanitized client team membership returned by the API. */
export const clientTeamMemberViewSchema = z.object({
  id: objectIdSchema,
  clientId: objectIdSchema,
  userId: objectIdSchema,
  roleInTeam: z.enum(CLIENT_TEAM_ROLES),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ClientTeamMemberView = z.infer<typeof clientTeamMemberViewSchema>;

/**
 * Input for adding or updating a team member.
 *
 * `userId` comes from the URL path, so it is omitted here. Every field is
 * optional: omitted fields keep their current value (or the schema default
 * for new memberships).
 */
export const clientTeamMemberUpdateSchema = clientTeamMemberInputSchema
  .omit({ userId: true })
  .partial();

export type ClientTeamMemberUpdate = z.infer<typeof clientTeamMemberUpdateSchema>;

/** Sanitized designated client/job-role assignment returned by the API. */
export const clientRoleAssignmentViewSchema = z.object({
  id: objectIdSchema,
  clientId: objectIdSchema,
  jobRoleId: objectIdSchema,
  userId: objectIdSchema,
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ClientRoleAssignmentView = z.infer<typeof clientRoleAssignmentViewSchema>;
