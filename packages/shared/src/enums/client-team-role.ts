/**
 * Role a user holds within a client's team.
 *
 * `manager` marks a user who manages the client (and therefore contributes to
 * Manager scope). `member` marks any other active team member. The primary
 * Manager for a client is recorded separately on the client record.
 */
export const CLIENT_TEAM_ROLES = ['manager', 'member'] as const;

export type ClientTeamRole = (typeof CLIENT_TEAM_ROLES)[number];

export const DEFAULT_CLIENT_TEAM_ROLE: ClientTeamRole = 'member';
