/**
 * Employee account status.
 *
 * Deactivated (`inactive`) users must not retain access to protected
 * resources; session invalidation is handled by the authentication module.
 * See docs/02-authentication.md.
 */
export const USER_STATUSES = ['active', 'inactive'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const DEFAULT_USER_STATUS: UserStatus = 'active';
