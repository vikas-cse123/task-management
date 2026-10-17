# 03 — Authorization

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§5, §6, §3.5. Enforcement is always **server-side**.

## 1. Model

```
effective permission = base(accessLevel) ∪ granted(capabilities)   ∩ scope
```

- **base** — what the Admin/Manager/Employee access level implies.
- **granted** — optional capabilities (never new access levels).
- **scope** — the clients/projects/records the user may touch.

Capabilities are defined in `packages/shared/src/permissions/capabilities.ts`
and enforced in later approved steps.

## 2. Access levels (exactly three)

| Level | Intent |
| --- | --- |
| Admin | Full workspace administration. |
| Manager | Scoped to assigned clients/projects; optional capabilities. |
| Employee | Linked/assigned work and necessary client context only. |

Access levels are independent of functional job roles and of Better Auth's
internal administrative role. A "Project Manager" job role does **not** by
itself grant Manager access.

## 3. Functional job roles (seeded, stable identifiers)

`video_ad_script_writer`, `video_editor`, `graphic_designer`,
`performance_marketer`, `crm_data_executive`, `project_manager`.

- An employee may hold **multiple** job roles, possibly spanning departments.
- Department associations are **derived** from job roles; employees are not
  restricted to one department.

## 4. Scope

- **Admin** — all clients and projects.
- **Manager** — only clients/projects where the Manager has an **active client
  team membership**. The **primary Manager** is the principal person
  responsible for a client.
- **Employee** — only assigned/linked work plus necessary client context.
  Working on one task does not grant unrestricted access to the whole client.

## 5. Client role assignments

- Each client has designated employees per functional job role.
- Ideally one **active primary** designated employee per client/job-role
  combination (enforced by unique index + application validation).
- Client membership (authorization scope) is conceptually separate from primary
  role mappings (automatic assignment).
- Assigning a designated person for a client/job role auto-creates that client's
  team membership **in the same transaction**.

## 6. Permission matrix

The table below is the authoritative Phase 1 matrix. "Capability" names refer to
`CAPABILITIES` in `packages/shared`.

| Action | Admin | Manager | Employee | Capability gate |
| --- | --- | --- | --- | --- |
| View clients / projects | All | Assigned scope only | Linked/assigned work + permitted context | — |
| Create / edit clients | Yes | Assigned clients if explicitly allowed | No | `clients.manage` (Manager) |
| Edit client team mappings | Yes | Assigned clients if explicitly allowed | No | `clients.team.manage` (Manager) |
| Create project from template | Yes | Assigned clients | No | `projects.create_from_template` (Manager) |
| Create / reassign tasks | Yes | Assigned scope | Only own subtasks if specifically authorized | `tasks.create_or_reassign` / `tasks.manage_own_subtasks` |
| Update own task | Yes | Yes | Yes | — |
| Submit work for approval | Yes | Yes | Yes | — |
| Approve / reject work | Yes | If designated approver | No by default | `work.approve` |
| Create / manage meetings | Yes | Assigned scope | Only if specifically authorized for the meeting | `meetings.manage` |
| Manage templates | Yes | No | No | Admin base only |
| Manage workspace settings | Yes | No | No | Admin base only |
| Create employee accounts | Yes | No | No | Admin base only |
| Change employee access levels | Yes | No | No | Admin base only |

## 7. Additional rules

- Every protected API enforces authorization **server-side**.
- Managers stay within their authorized clients/projects.
- Employees do not automatically get unrestricted client access from one task.
- An employee cannot approve their own submitted work unless an explicit
  exception is authorized.
- A **designated approver** must approve work when approval is required.
- Changing URL parameters must never bypass checks (IDOR prevention).
- Never trust client-provided access level, job roles, assignees, or client IDs.
- Optional permissions must be expressible without adding access levels.
- Critical permission and assignment changes must be **audited**.

## 8. Integrity rules (approved)

- A designated assignee must be an **active** employee who **holds the
  corresponding job role**.
- Client membership and role assignments must stay consistent.
- Invalid active assignments must be prevented.
- Application access levels remain separate from Better Auth internal roles.

## 9. Step 4 implementation notes

- Every `/api/v1/users` route is guarded by `requireActiveSession` + `requireAdmin`; the actor id is read from the resolved server session, never the request body.
- Application profile fields are `input: false` (ADR 0005): clients cannot set access level, status, job roles or capabilities.
- Lockout protection: an Admin cannot change their own access level or deactivate themselves, and the last active Admin cannot be demoted or deactivated.
- Deactivation revokes the user's sessions; every critical change writes an audit record (`user.*`).
- Reference data (departments, functional job roles) is readable by any active user; only Admins may edit display name/description. Keys and relationships are immutable.
- Optional Manager/Employee capabilities are granted per user and evaluated by `hasCapability` (Admin implicitly holds all).

## 10. Step 5 implementation notes

- Client listing is scope-filtered in the service layer: Admins read every
  client; Managers and Employees read only clients where they hold an active
  team membership. Out-of-scope reads and writes return 404 (IDOR prevention).
- Editing a client requires `clients.manage`; team and designation changes
  require `clients.team.manage`; creating a client is Admin-only.
- The primary manager must be an active employee and automatically gains an
  active `manager` team membership; the membership cannot be deactivated while
  the user is the primary manager.
- Deactivating a membership also deactivates that member's active designated
  role assignments. Designated assignment itself is transactional and requires
  a replica-set MongoDB deployment.

## 11. Step 6 security audit (2026-10-17, all Phase 1 endpoints)

Method: code review of every route/service/guard plus executed tests
(`apps/api/tests/*.test.ts` and `apps/web/e2e/security.spec.ts`, 16/16 E2E
green). Verdicts on the twelve audit points:

1. Public signup disabled at the library level (`disableSignUp: true`);
   `POST /api/auth/sign-up/email` returns 400 with no session cookie.
2. All fifteen Better Auth admin-plugin HTTP paths blocked via `disabledPaths`
   (exact match); probed paths return 404.
3. Employee creation and permission management are Admin-only
   (`requireAdmin` + service guards); profile fields are `input: false`.
4. Client edits require `clients.manage` **and** active membership scope;
   team/role edits require `clients.team.manage` **and** scope.
5. Client creation is Admin-only (middleware + service guard); managers get
   403 over HTTP and no creation UI.
6. Employees list only clients where they hold an active membership; direct
   URLs to other clients return 404 (verified for manager and employee).
7. Membership grants scoped reads (client summary, team, designations) only —
   no cross-client data, no employee administration, no settings.
8. Every protected endpoint runs `requireActiveSession` (session + active
   account + password already changed), except the force-change flow itself.
9. Scope is resolved server-side from the session on every request; URL ID
   tampering returns 404 (existence not leaked) or 403.
10. User deactivation revokes sessions immediately (no cookie cache);
    membership deactivation clears that member's designations; the primary
    manager membership cannot be deactivated while assigned.
11. `toUserProfile` exposes no hashes/tokens/secrets; the Pino logger redacts
    passwords, tokens, cookies and authorization headers; bootstrap secrets
    come from server-side env only and are never logged.
12. Designated assignment/removal runs in a MongoDB transaction (partial
    unique index guards the single-active-primary invariant); requires a
    replica-set deployment. Verified on an isolated single-node replica set.

One fix applied: the unused `express-rate-limit` dependency was removed
(Better Auth rate limiting was already active on auth routes).

## 12. Phase 2 authorization (projects, tasks, approvals)

Matrix source: `docs/00-product-requirements.md` §5. Task creation needs no
new capability: Managers create/reassign tasks by scope alone; project edits
keep the `clients.manage` gate (Step 7.6); project creation stays Admin-only.

- Projects: Admin sees/manages all; Managers read member-client projects and
  edit them with `clients.manage`; Employees read only projects containing
  their own non-cancelled assigned work. Creation is Admin-only.
- Project Managers (assigned `managerId`) gain client-team membership, never
  access levels or permissions.
- Tasks: Admin all; Managers member-client tasks; Employees assigned tasks
  plus parent context for their subtasks. Membership alone never opens a
  project or task.
- Task creation/edit/assignment: Admin, or Manager in scope. Assignees may
  start, submit, complete (no-approval), block, and edit description/due date
  on their own work.
- Subtask creation: Admin or in-scope Manager (employees never by default).
- Approvals: only the designated approver inside the task scope; no
  self-approval for anyone, including Admins. Revision/cancel/block/unblock/
  reopen reasons are mandatory. Done/Cancelled exit only via reopen
  (Manager/Admin).
- Every mutation is audited (sanitized) with a parallel user-visible task
  activity entry; status flows are transactional with optimistic concurrency.

## 13. Step 12 security audit (Phase 2 endpoints)

Method: code review of every new route/service/guard plus executed tests
(API suites, `apps/web/e2e/phase2-security.spec.ts`, full 34-test E2E green).

- Auth/session/force-change guards on all routes; Admin-only project and
  client creation enforced in middleware and services.
- Manager edits confined to member scope; out-of-scope reads/writes return
  404 (verified for projects, tasks, clients, team, roles, activity).
- Employees cannot create projects/tasks, reassign work, edit settings, or
  approve without designation; URL tampering returns 404/403, never data.
- No mass assignment: update schemas exclude status, assignee (tasks),
  client (projects), access levels and roles (users).
- No secret leakage: task/project/activity payloads carry no hashes, tokens
  or sessions; audit and activity values are sanitized.
- Concurrency: transactions + `__v` checks; parallel approvals produce a
  single transition (tested); stale versions get 409.
- General `/api/v1` rate limiting restored (1000 req / 15 min, proxy-aware,
  skipped in `test` env); Better Auth keeps stricter auth-route rules.

## 14. Phase 4 authorization (templates and generation)

Matrix source: `docs/00-product-requirements.md` §5 and §9. Templates are a
workspace-level asset; project creation from a template is a capability-gated,
scope-bounded Manager action.

- **Managing templates is Admin-only.** Create, update, save-draft, validate,
  publish and archive are guarded by `requireAdmin()` in the router and again in
  the service (403 regardless of request body). Employees can never reach the
  template surface.
- **Managers may read published templates only** — their list query is forced to
  `status: published`, and details/versions return 404 for drafts or archived
  templates, so template internals are not leaked.
- **Project generation** requires the `projects.create_from_template`
  capability (Admins implicitly hold it; a Manager must be granted it) **and**
  client scope: Managers may generate only for clients where they hold an active
  team membership; out-of-scope clients return 404 (IDOR protection). The
  Project Manager assigned during generation gains membership, never elevated
  access.
- **Assignment resolution never invents eligibility.** A template's designated
  employee override is accepted only when the person is an active client member
  holding the required job role. Missing designations become visible
  `needs_assignment` warnings; they never auto-assign an arbitrary employee.
- **Approver authorization is preserved.** When a template node requires
  approval, the approver resolves to the project's Project Manager (who already
  holds approval authority), never to an employee without it; unresolved
  approvers become visible `needs_approver` warnings.
- **Template variable injection is impossible.** Only the allow-listed
  `{{variable}}` keys substitute; unknown or malformed placeholders are rejected
  at validation, and `{{adIndex}}` is allowed only inside a repeat group.
- **Invalid graphs cannot be published.** Graph validation (duplicate/unknown
  keys, one-level nesting, self/duplicate/parent-child/cyclic edges, unknown
  variables, approval/approver consistency) runs on the persisted draft before
  publish and again before preview/creation.
- Existing Phase 1–3 rules still hold: every route runs `requireActiveSession`;
  generated tasks carry no elevated permissions; approving generated work obeys
  the designated-approver rule.

## 15. Step 24 security audit (Phase 4 endpoints)

Method: code review of the template/generation routers and services plus
executed tests (`apps/api/tests/{templates,generation}.test.ts`,
`apps/web/e2e/phase4-*.spec.ts`, full 69-test E2E green).

- **Admin-only template management** enforced in middleware and service;
  Employees and Managers are blocked; Managers see published templates only.
- **Manager-scoped template use**: capability + active-membership scope on
  generation; out-of-scope clients are 404.
- **Cross-client isolation**: generation validates the client is active and in
  scope; generated projects stay within the selected client.
- **Role-based assignment validation**: overrides are rejected unless the person
  is an active member holding the required role; primary designations are
  re-validated for eligibility at preview/creation.
- **Approver authorization**: only the Project Manager can resolve as approver;
  no self-approval; unresolved approvers are surfaced, not silently assigned.
- **Template variable injection / dangerous expressions**: allow-listed
  variables only; no expression evaluation; unknown keys rejected.
- **Graph validation**: invalid/cyclic graphs cannot publish or instantiate.
- **Concurrent publish**: unique partial index (one published version per
  template) plus optimistic concurrency; a conflicting publish is a 409.
- **Idempotency abuse**: unique `idempotencyKey`; same key + different payload
  is 409; the record is written transactionally with the project graph.
- **Transaction boundaries**: all writes for one generation commit atomically;
  a failure leaves no partial project; a duplicate-key race resolves to the
  existing result.
- **Audit-log redaction**: generation writes a sanitized `project.generate`
  audit entry; no credentials, tokens or sessions are stored.
- **Unauthorized modification of existing generated projects**: generation never
  mutates previously created projects; template edits only affect future
  instantiations (published versions are immutable).

## 16. Phase 5 authorization (notifications)

Matrix source: `docs/00-product-requirements.md` §11. Notifications are
per-recipient; workspace configuration is Admin-only.

- **Self-service is own-data only.** The notification centre, unread count,
  read/read-all and `/me/notification-consent` require `requireActiveSession` and
  are scoped to the actor's own `recipientUserId`; a user can never read or
  mutate another employee's notifications or consent.
- **Admin-only administration.** Channel settings, template mappings, statistics,
  integration status, notification logs and manual retry are guarded by
  `requireActiveSession` + `requireAdmin()`; Managers and Employees receive 403.
- **Consent is the employee's own.** Only the employee updates their own
  `whatsappOptIn`/phone; the system never invents consent, and a Manager cannot
  consent on an employee's behalf.
- **Escalations are Manager-scoped.** `task.overdue_escalation` targets only the
  project's Project Manager (resolved server-side from `ProjectModel.managerId`),
  never an arbitrary or out-of-scope user.
- **Provider credentials are server-side only.** `WHATSAPP_*` are read only in
  API/worker env config, never returned to the SPA.
- **Webhook is public but verified.** `GET/POST /webhooks/whatsapp` bypass the
  session guard by design but are protected by the verify token and the
  `X-Hub-Signature-256` HMAC over the raw body.
- Existing Phase 1–4 rules still hold: every non-webhook route runs
  `requireActiveSession`; scope/isolation rules are unchanged.

## 17. Step 30 security audit (Phase 5)

Method: code review of the Phase 5 surface plus executed tests
(`apps/api/tests/{notifications,webhooks}.test.ts`, `packages/db/test/*`,
`apps/web/e2e/phase5-notifications.spec.ts`, full 78-test E2E green). The full
20-point audit is in `docs/phase5-completion-report.md` §21; highlights:

- **Token handling**: server-side only; never in responses, logs or errors.
- **Webhook signatures**: raw-body HMAC verified with constant-time compare;
  unsigned/forged requests rejected; unknown IDs ignored with 200; delivery
  statuses advance-only.
- **Notification isolation**: centre/read endpoints filter by the actor's own
  recipient id (no cross-client/cross-user access).
- **Settings/retry authorization**: Admin-only; retry limited to `failed` records.
- **Consent**: stored, enforced at dispatch; no invented consent; no sends after
  opt-out; opt-in does not replay history.
- **No sends during transactions**: provider calls occur only in the worker
  dispatch path.
- **Idempotency / bounded retry**: unique event keys; `NOTIFICATION_MAX_ATTEMPTS`
  then terminal failure.
- **No worker HTTP surface**: `apps/worker` exposes no routes to secure.
- **Activation boundary**: first enable sets `activatedAt`; no historical flood.
- **No rollback from WhatsApp failure**: messaging is outside the business
  transaction.
- Two functional (non-exploitable) integration bugs were found and fixed (see
  report §26); no new security defects were found.
