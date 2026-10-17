import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_SESSION_COLLECTION, BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';

export interface UserAccountServiceOptions {
  connection?: Connection;
}

function resolveConnection(options: UserAccountServiceOptions): Connection {
  return options.connection ?? getConnection();
}

/**
 * Toggle the forced-password-change flag on the Better Auth user document.
 *
 * The flag lives on the identity (`additionalFields`); the value is never
 * client-writable. Called after a successful forced password change.
 */
export async function setPasswordChangeRequired(
  userId: string,
  required: boolean,
  options: UserAccountServiceOptions = {},
): Promise<void> {
  const id = assertObjectId(userId, 'user');

  await resolveConnection(options)
    .collection(BETTER_AUTH_USER_COLLECTION)
    .updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { requiresPasswordChange: required, updatedAt: new Date() } },
    );
}

/**
 * Revoke every session belonging to a user (server-side invalidation).
 *
 * Used when an account is deactivated or an Admin revokes sessions. Matches
 * both the ObjectId and legacy string encodings of `userId` for robustness.
 * Returns the number of sessions removed.
 */
export async function revokeUserSessions(
  userId: string,
  options: UserAccountServiceOptions = {},
): Promise<number> {
  const id = assertObjectId(userId, 'user');

  const result = await resolveConnection(options)
    .collection(BETTER_AUTH_SESSION_COLLECTION)
    .deleteMany({ $or: [{ userId: new mongoose.Types.ObjectId(id) }, { userId: id }] });

  return result.deletedCount ?? 0;
}
