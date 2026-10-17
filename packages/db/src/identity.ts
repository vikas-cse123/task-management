/**
 * Identity strategy shared by every application-domain reference to a user.
 *
 * Better Auth owns the authentication collections through its MongoDB adapter.
 * With the adapter's default configuration it uses:
 *
 * - a singular collection/model named `user` (the adapter defaults
 *   `usePlural` to false), and
 * - an `ObjectId` for the document `_id` (mapped to the adapter's `id`
 *   field), unless `advanced.database.generateId` is set to `"uuid"`.
 *
 * Application collections therefore reference users by storing the Better Auth
 * user `ObjectId` in a `userId`/`actorId`/`primaryManagerId` field. No custom
 * user identifier is generated. See
 * docs/adr/0004-better-auth-identity-strategy.md.
 */
export const BETTER_AUTH_USER_MODEL = 'user';

export const BETTER_AUTH_USER_COLLECTION = 'user';

/** Better Auth session collection (used for server-side session revocation). */
export const BETTER_AUTH_SESSION_COLLECTION = 'session';
