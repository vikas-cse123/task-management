# ADR 0005 — Application User Profile on the Better Auth User Document

- **Status:** Accepted
- **Date:** 2026-10-17
- **Context:** Phase 1 needs an application profile (access level, status,
  job-role references, granted capabilities, forced-password-change flag,
  WhatsApp opt-in state, creator reference) on every user. ADR 0004 deferred the
  choice between storing this on the Better Auth `user` document via
  `additionalFields` and a separate profile collection. The authentication step
  must resolve it.

## Verified facts (from the installed packages)

Inspected version **`better-auth@1.7.10`**:

1. `user.additionalFields` accepts a map of field name → `DBFieldAttributeConfig`
   (`{ type, required, defaultValue, input, ... }`). Additional fields are
   returned by `auth.api.getSession()` / `get-session`, stored in the same
   `user` document, and are therefore also available to the MongoDB adapter's
   `create`/`update` calls.
2. Setting `input: false` makes a field **server-managed**: clients cannot set it
   through any HTTP endpoint (sign-up, update-user, or plugin routes). The
   Admin plugin's `/admin/create-user` accepts a `data` object that spreads extra
   keys into `internalAdapter.createUser`, so **server-side** code can still
   populate `input: false` fields.
3. The `session.create.before` database hook receives
   `(session, ctx)` where `ctx.context.internalAdapter.findUserById` is
   available, so account state can block session creation before a cookie exists.
4. Additional fields are typed (`Date`, `string[]`, etc.) and round-trip through
   the adapter; `supportsArrays` is true for both the MongoDB and in-memory
   adapters.

## Decision

- The application profile lives on the **Better Auth `user` document** via
  `user.additionalFields`. There is **no** separate profile collection and no
  duplicate identity system.
- Fields (all `input: false`, provisioned/updated server-side only):
  `accessLevel`, `status`, `jobRoleIds`, `capabilities`,
  `requiresPasswordChange`, `whatsappNumber`, `whatsappOptIn`,
  `whatsappOptInAt`, `whatsappOptInSource`, `createdBy`.
- The public-facing field list is the single source of truth in
  `packages/shared/src/schemas/user.ts` (`APP_USER_ADDITIONAL_FIELDS`), consumed
  by the API's `user-fields.ts` configuration and by the projection to
  `UserProfile`.
- Account administration is performed **server-side** (bootstrap script, Admin
  API services, `UserAccountWriter`) rather than through the Admin plugin's HTTP
  endpoints, which are blocked at the library level with `disabledPaths`.
- `status: 'inactive'` blocks session creation via `session.create.before` and is
  re-checked on every protected request (`requireActiveAccount`); the cookie
  cache is disabled so changes take effect immediately.
- `requiresPasswordChange` pins the user to `/change-password`; the API clears
  it only after a successful credential change.

## Consequences

- Domain references (`primaryManagerId`, `client-team-member.userId`, audit
  `actorId`) remain `ObjectId` referencing the Better Auth `user` `_id`
  (ADR 0004) — no change.
- `EmployeeDirectory` can read the profile fields directly from the `user`
  collection without a join.
- Application profile values never appear in client-writable payloads; the
  API's `toUserProfile` is the only outbound projection and never includes
  `passwordHash`, tokens, or Better Auth internal fields.
- Frontend session state is read from `GET /api/v1/me`, which reflects the
  current document on every request (no cookie cache), so revocation and
  deactivation are immediate.

## Alternatives considered

- **Separate `users` profile collection** — rejected: introduces a second store
  for identity-adjacent data, requires a join for every assignment check, and
  risks divergence from the Better Auth document.
- **Relying on the Admin plugin's HTTP endpoints for administration** —
  rejected: those endpoints authenticate an **admin session** and would expose
  account management on the public HTTP surface; blocking them and using
  validated server-side services is safer.
