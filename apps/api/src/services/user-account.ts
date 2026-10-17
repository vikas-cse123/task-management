import { revokeUserSessions, setPasswordChangeRequired } from '@interscale/db';

/**
 * Server-side writer for account fields owned by the application profile.
 *
 * Injected so the API can run against a real database in production and an
 * in-memory store in tests, without the HTTP layer depending on a live
 * connection.
 */
export interface UserAccountWriter {
  setPasswordChangeRequired(userId: string, required: boolean): Promise<void>;
  revokeUserSessions(userId: string): Promise<number>;
}

/** Production implementation backed by the Better Auth collections. */
export const dbUserAccountWriter: UserAccountWriter = {
  setPasswordChangeRequired,
  revokeUserSessions,
};
