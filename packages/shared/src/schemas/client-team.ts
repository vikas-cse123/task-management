import { z } from 'zod';
import { CLIENT_TEAM_ROLES, DEFAULT_CLIENT_TEAM_ROLE } from '../enums/client-team-role';
import { objectIdSchema } from './primitives';

/**
 * Input for adding or updating a client team member.
 *
 * `userId` references a Better Auth user. The API layer validates that the user
 * exists and is active before persisting.
 */
export const clientTeamMemberInputSchema = z.object({
  userId: objectIdSchema,
  roleInTeam: z.enum(CLIENT_TEAM_ROLES).default(DEFAULT_CLIENT_TEAM_ROLE),
  isActive: z.boolean().default(true),
});

export type ClientTeamMemberInput = z.infer<typeof clientTeamMemberInputSchema>;

/**
 * Input for designating a client role assignment.
 *
 * When `isPrimary` is true the assignment becomes the single active primary
 * designated employee for the client/job-role combination.
 */
export const clientRoleAssignmentInputSchema = z.object({
  jobRoleId: objectIdSchema,
  userId: objectIdSchema,
  isPrimary: z.boolean().default(false),
});

export type ClientRoleAssignmentInput = z.infer<typeof clientRoleAssignmentInputSchema>;
