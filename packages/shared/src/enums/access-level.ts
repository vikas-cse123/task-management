/**
 * Application access levels.
 *
 * These are the ONLY three application access levels and are deliberately
 * separate from functional job roles and from Better Auth's internal
 * administrative role. See docs/03-authorization.md.
 */
export const ACCESS_LEVELS = ['Admin', 'Manager', 'Employee'] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const DEFAULT_ACCESS_LEVEL: AccessLevel = 'Employee';
