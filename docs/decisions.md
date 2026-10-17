# Decisions Log

Approved decisions for the Project & Team Management System. Each entry records
the decision, rationale, and status. Ambiguities that remain unresolved are
listed separately and must **not** be silently decided.

> **Note on IDs:** the "D" identifiers were renumbered once (2026-10-17) so the
> Phase 1 implementation decisions D6/D7 requested during the shared-contracts /
> database-foundation step match the numbering used in project reports. No
> decision content was removed; the former D6/D7 content moved to D8/D9 and the
> former D8–D11 shifted to D10–D12. Old D7 (multi-role employees) is subsumed by
> the expanded D7 below.

## Approved (Phase 1 planning clarifications)

| # | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D1 | Managers may receive optional capabilities to edit **assigned** clients and team mappings; creating **new** clients is **Admin-only** initially. | Supports scoped Manager work without broad client-creation rights. | Approved |
| D2 | **Active client team membership** determines Manager scope; the **primary Manager** is the principal person responsible for a client. | Clear scope + clear ownership. | Approved |
| D3 | Assigning a designated person for a client/job-role auto-creates client team membership **in the same transaction**. | Keeps membership and role assignments consistent. | Approved |
| D4 | Seed **4 departments + 6 functional job roles**. Admin may manage descriptions/settings. Referenced records cannot be deleted. Stable identifiers are preserved. | Reference data stability for templates/assignments. | Approved |
| D5 | Employees view **essential client context + assigned/linked work only**. | Prevents over-broad employee access (correction C). | Approved |
| D6 | **Manager permissions (final).** Admin creates clients. Managers access only assigned clients. Admin may grant `clients.manage` so a Manager can edit **existing assigned** clients, and `clients.team.manage` so a Manager can manage team assignments **within their authorized client scope**. Manager permissions are always restricted to authorized clients. Managers **cannot** create clients, change employee access levels, or grant themselves permissions. All enforcement is server-side. | Finalizes the former open item 6. | Approved |
| D7 | **Departments and job roles (final).** Seed the four departments (Creative Production, Performance Marketing, CRM & Data Operations, Project Management) and six functional job roles (Video Ad Script Writer, Video Editor, Graphic Designer, Performance Marketer, CRM/Data Executive, Project Manager). Admin may edit display names and descriptions. Stable internal identifiers are preserved. Referenced departments/roles are never deleted. An employee may hold multiple job roles spanning different departments; employees are not forced into a single department. | Finalizes the former open item 7. | Approved |
| D8 | Temporary passwords are **cryptographically secure**, shown to Admin **once**, force change on first login, never logged. | Secure account provisioning without an email service. | Approved |
| D9 | Designated client/job-role assignments are validated: the assignee must be an **active** employee who **holds the job role**; membership and role assignment stay consistent; invalid active assignments are prevented. Enforced in the foundation step. | Data integrity (corrections A/B). | Approved |
| D10 | Preserve **sanitized audit history without TTL** in MVP; document the need for a retention policy. | Compliance + simplicity. | Approved |
| D11 | Keep **application access levels (Admin/Manager/Employee) separate from Better Auth internal roles**; protect account-admin endpoints server-side. | Prevents privilege escalation (corrections E/F). | Approved |
| D12 | Preserve the full specification verbatim in the repo; maintain `AGENTS.md`. | Keep requirements available to future sessions (correction G). | Approved |

## Technical decisions (recorded as ADRs)

| ADR | Decision |
| --- | --- |
| [0001](./adr/0001-typescript-version-pin.md) | Pin TypeScript to `^6.0.3` (typescript-eslint peer range). |
| [0002](./adr/0002-same-origin-no-cors.md) | Same-origin requests (Vite proxy + Nginx); no CORS package. |
| [0003](./adr/0003-mongodb-over-relational.md) | MongoDB (not PostgreSQL/Prisma) per the final approved stack. |
| [0004](./adr/0004-better-auth-identity-strategy.md) | Reference Better Auth users by their `ObjectId` `_id` from the singular `user` collection; no custom user IDs. |
| [0005](./adr/0005-user-profile-on-better-auth-user.md) | Store the application user profile on the Better Auth `user` document via `additionalFields`; no separate profile collection. |

## Resolved during the foundation step

- **Manager edit conditions** — resolved by D6.
- **Departments/roles editable vs seed-only** — resolved by D7 (seed-only
  records, editable display name/description, stable keys).
- **Better Auth identity/reference strategy** — resolved by ADR 0004.

## Resolved during the authentication step

- **Profile storage (open item 10)** — resolved by ADR 0005: the application
  profile lives on the Better Auth `user` document via `additionalFields`.
- **Employee account administration surface** — account creation/updates are
  server-side only; every Admin-plugin HTTP path is blocked at the library level
  with `disabledPaths` (exact-match list in `apps/api/src/auth/auth.ts`).
- **Session freshness** — cookie cache disabled; `status`/revocation changes take
  effect on the next request.

## Resolved during Step 6
- **Unused `express-rate-limit` dependency removed.** It was listed in the
  approved stack but never wired into the app; Better Auth's built-in rate
  limiting (production-enabled, with strict sign-in/change-password rules)
  already protects auth routes. Removing it avoids implying protection that
  does not exist. General `/api/v1` rate limiting is deferred to a later
  phase if load testing requires it.
  **Reversed in Phase 2 (§4 instruction):** `express-rate-limit@8` is wired as
  a general `/api/v1` ceiling (1000 req / 15 min per IP, reverse-proxy aware,
  skipped when `NODE_ENV=test`). Better Auth keeps its own stricter auth
  rules. Verified live with an `X-Forwarded-For` probe.
- **As-built screen consolidations.** Employee create/edit and client create
  are inline dialogs/forms on their list pages (not separate
  `/team/new`, `/team/:id`, `/clients/new` routes); reference-data editing
  lives under a single Admin-only `/settings` screen. All §13 screen goals
  are covered; see `docs/06-frontend.md` §7.
- **Dashboard shows real scoped data only.** No fabricated statistics: every
  Overview figure is a live scoped query (Admin = agency-wide, others =
  assigned clients).
- **E2E runs serially on isolated infrastructure.** `workers: 1`, a dedicated
  SPA port bound explicitly to `127.0.0.1`, and a rebuilt `interscale_e2e`
  database per run (fixtures expire because passwords change).

## Resolved during Phase 2 (Steps 7–12)

- **Task creation needs no new capability.** The §5 matrix grants Managers
  task create/reassign by scope; `clients.manage` still gates project edits
  and `clients.team.manage` still gates client-team edits. Documented in
  `docs/03-authorization.md` §12.
- **Project creation stays Admin-only** until template-based creation
  (Phase 4); no Manager capability was introduced for it.
- **No self-approval for anyone**, including Admins; approver must be
  designated and in scope.
- **Reopen resets completion state** (Done/Cancelled → In Progress, clears
  submission/approval/completion stamps; history stays in activity/audit).
- **Progress rules:** parent = completed non-cancelled children / total
  non-cancelled children (childless = own completion); project = completed
  active leaves / total active leaves; cancelled never counts.
- **Overdue/Needs-Assignment are derived flags**, never statuses.
- **TanStack Table v8 pinned** for My Tasks (v9 changed the component API;
  v8 is the stable classic API and satisfies the approved stack entry).
- **E2E serial execution kept** (`workers: 1`) with rebuilt fixtures per run.

## Resolved during Phase 3 (Steps 13–18)

- **General `/api/v1` rate limiting restored** (`express-rate-limit`, 1000 req /
  15 min per IP, proxy-aware, skipped in `test` env) per the Phase 3 §4
  instruction; Better Auth keeps stricter auth-route rules. Verified live.
- **Cycle safety via per-project graph versioning:** edge add/remove bumps
  `projects.dependencyVersion` inside the same transaction (optimistic
  concurrency + one retry), so concurrent graph edits serialize without
  distributed locks.
- **Manual vs dependency blocking:** `manualBlockReason` on the task plus a
  derived blocker model; dependency transitions never set or clear manual
  reasons, and manual unblock reevaluates dependencies immediately.
- **Auto-assignment is opt-in** (`autoAssign` flag) or explicitly triggered
  (resolve endpoint); provenance (`manual` / `role_mapping`) recorded in
  assignment audit payloads; template overrides accepted but reported
  unresolvable until Phase 4.
- **Readiness is a durable deduplicated event** (`workflowEvents`, unique
  per task version); records readiness only, never delivery.
- **Review flags over silent rewrites:** reopen/cancel propagate impact
  (To Do → Blocked, rest flagged); resolution records decisions without
  touching statuses.
- **TanStack Table v8 pinned** (v9 changed the component API).
- **E2E runs against `vite preview`** (production bundle): the dev server's
  file watcher reloaded the app on Playwright artifact writes, wiping form
  state mid-test; preview has no watcher and no StrictMode double-mounts.
  Serialized multi-add flows wait for each edge before continuing.

## Unresolved — do not invent (see 00 §22)

1. Exact default owner for the Creative Lead/Manager parent video task.
2. Relative deadlines for campaign and onboarding template tasks.
3. How external access prerequisites are confirmed.
4. Exact recurrence rules for weekly campaign reviews.
5. Representation of "Needs Assignment" without adding a seventh task status.
6. Precise employee invitation/password-delivery workflow.
7. Any additional approval exceptions.
8. Detailed audit retention rules.
9. Whether the minimal client status set (`active` / `inactive`) is sufficient
   for the MVP, or additional business statuses are required.

## Technical verifications completed

- Better Auth `1.7.10` + `@better-auth/mongo-adapter` `1.7.10` inspected: the
  adapter maps `id` ↔ `_id`, generates `ObjectId` by default, and uses singular
  model/collection names (`user`, `session`, `account`, `verification`).
- MongoDB transaction behavior verified against an isolated single-node replica
  set (`rs0`) on port 27018.
- Better Auth Admin plugin endpoint protection verified: the plugin routes exist
  but are blocked at the library level with `disabledPaths` (exact-match list);
  blocked paths return `404`. Covered by `apps/api/tests/auth.test.ts`.
- Better Auth configuration surface verified for the authentication step:
  `emailAndPassword.disableSignUp`, `user.additionalFields` with `input: false`,
  `session.cookieCache.enabled = false`, `databaseHooks.session.create.before`,
  `rateLimit.customRules`, `advanced.defaultCookieAttributes`, `disabledPaths`.
- Cookie/CSRF behavior verified: same-origin requests with HTTP-only,
  `SameSite=Lax` cookies; `change-password` rotates the session and the new
  cookie is forwarded to the client.
- Step 6 twelve-point API security audit: all points verified by code review
  plus executed tests (`apps/api/tests/*`, `apps/web/e2e/security.spec.ts`);
  single fix was the `express-rate-limit` removal above.
- Playwright E2E: 18/18 green (12 scenarios, 4 HTTP security checks,
  settings/profile coverage) against the running app on an isolated
  single-node replica-set database; unit/integration totals: shared 14,
  db 61, api 31 — 0 failed, 0 skipped.
- Phase 2 E2E: 34/34 green (Phase 1 regression + 24 required scenarios and
  security checks) on the isolated `interscale_e2e` database; unit/integration
  totals: shared 14, db 86, api 53 — 0 failed, 0 skipped.
- Phase 3 E2E: 54/54 green (Phase 1/2 regression + 30 required scenarios and
  security checks) on the isolated `interscale_e2e` database; unit/integration
  totals: shared 14, db 113, api 58 — 0 failed, 0 skipped.

## Technical verifications still required

- Agenda v6 Mongo backend configuration (notifications step).
