# 05 — API (Phase 1)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§17 and §25.5. Base path: `/api/v1`. Better Auth routes use their own required
prefix.

## 1. Conventions

- REST, JSON. Input validated with **Zod** at the boundary.
- Auth via secure session cookie; authorization enforced **server-side**.
- Consistent error shape: `{ error: { code, message, details? }, requestId }`.
- Every request has a **request ID** (header `x-request-id`), included in logs
  and error responses.
- Pagination via `limit` / `cursor` (or `page`) query params; lists return
  `{ data, page }` envelope.
- Idempotency keys required on operations where duplicate execution would create
  duplicate work (e.g. project-from-template, task creation from action items,
  notification dispatch) — later phases.
- Documented with OpenAPI/Swagger.

## 2. Phase 1 endpoints

### Health
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Public | Liveness/readiness JSON. |

### Authentication (Better Auth)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | (Better Auth) sign-in | Public | Email + password. |
| POST | (Better Auth) sign-out | Session | Server-side invalidation. |
| GET | (Better Auth) session | Session | Current session/profile. |
| POST | (Better Auth) change-password | Session | Supports forced change. |

Public signup endpoints must be **disabled** at the library level.

### Users / employees (Admin only for writes)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | Admin | List employees. |
| POST | `/api/v1/users` | Admin | Create employee; returns one-time temporary password. |
| GET | `/api/v1/users/:id` | Admin, or self | Admin sees any; others only self. |
| PATCH | `/api/v1/users/:id` | Admin | Update permitted details. |
| PATCH | `/api/v1/users/:id/access-level` | Admin | Change access level (audited). |
| PATCH | `/api/v1/users/:id/job-roles` | Admin | Set functional job roles (audited). |
| PATCH | `/api/v1/users/:id/status` | Admin | Activate/deactivate (audited). |
| POST | `/api/v1/users/:id/sessions/revoke` | Admin | Revoke sessions. |
| GET | `/api/v1/me` | Session | Current application profile. |

### Departments (seeded)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/departments` | Session | List departments. |
| GET | `/api/v1/departments/:id` | Session | Detail. |
| PATCH | `/api/v1/departments/:id` | Admin | Update description/settings. Deletion blocked. |

### Job roles (seeded)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/job-roles` | Session | List job roles. |
| GET | `/api/v1/job-roles/:id` | Session | Detail. |
| PATCH | `/api/v1/job-roles/:id` | Admin | Update description/settings. Deletion blocked. |

### Clients
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/clients` | Scoped | Admin sees all; Manager/Employee see permitted scope only. |
| POST | `/api/v1/clients` | Admin | Create client (Admin-only initially). |
| GET | `/api/v1/clients/:id` | Scoped | Detail; not found if out of scope (no IDOR). |
| PATCH | `/api/v1/clients/:id` | Admin, or `clients.manage` within scope | Update client. |
| GET | `/api/v1/clients/:id/team` | Scoped | Team members + role mappings. |
| PUT | `/api/v1/clients/:id/team` | Admin, or `clients.team.manage` within scope | Manage client team mappings. |
| GET | `/api/v1/clients/:id/role-assignments` | Scoped | Designated assignments. |
| PUT | `/api/v1/clients/:id/role-assignments` | Admin, or `clients.team.manage` within scope | Set designated employee per role (validated active + holds role). |

### Audit (Phase 1, read-only)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/audit-logs` | Admin | Query by entity/actor/date. |

## 3. Error codes (Phase 1)

`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`,
`CONFLICT`, `CONCURRENT_MODIFICATION`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Missing client-role mapping, invalid due date, circular dependency, unauthorized
operation, concurrent modification, and failed WhatsApp delivery each surface a
clear, specific error rather than an unexplained failure (later phases).

## 4. Authorization notes

- List/detail endpoints are **scope-filtered** in the service layer, never by
  trusting client-provided IDs.
- Write endpoints check base level + capability + scope.
- Account-administration and template/workspace endpoints are Admin-only.
- All critical permission/assignment changes write to `auditLogs`.

## 5. Endpoints implemented (Steps 3–4)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | Liveness/health envelope. |
| GET | `/api/v1/me` | authenticated | Sanitized current profile. |
| POST | `/api/v1/me/change-password` | authenticated | Clears `requiresPasswordChange`; rotates the session. |
| GET | `/api/v1/users` | Admin | Filters: `status`, `accessLevel`, `jobRoleId`, `search`; cursor pagination. |
| POST | `/api/v1/users` | Admin | Creates an employee; returns the temporary password once. |
| GET | `/api/v1/users/:id` | Admin | Single employee. |
| PATCH | `/api/v1/users/:id` | Admin | Name, access level, status, job roles, capabilities, WhatsApp. |
| POST | `/api/v1/users/:id/sessions/revoke` | Admin | Revokes the user's sessions. |
| GET | `/api/v1/reference-data/departments` | authenticated | Seeded departments. |
| GET | `/api/v1/reference-data/job-roles` | authenticated | Seeded job roles. |
| PATCH | `/api/v1/reference-data/departments/:id` | Admin | Display name/description only. |
| PATCH | `/api/v1/reference-data/job-roles/:id` | Admin | Display name/description only. |

Better Auth routes are mounted under `/api/auth/*`; all `/api/auth/admin/*` paths are blocked (404).

| GET | `/api/v1/clients` | authenticated | Scope-filtered list; filters: `status`, `search`; cursor pagination. |
| POST | `/api/v1/clients` | Admin | Creates a client; an assigned primary manager gains an active membership. |
| GET | `/api/v1/clients/:id` | authenticated | In-scope only; out-of-scope returns 404. |
| PATCH | `/api/v1/clients/:id` | Admin or `clients.manage` in scope | Renames, restatuses, reassigns the primary manager. |
| GET | `/api/v1/clients/:id/team` | authenticated | In-scope only. |
| PUT | `/api/v1/clients/:id/team/:userId` | Admin or `clients.team.manage` in scope | Adds/updates a member; employee must exist and be active. |
| DELETE | `/api/v1/clients/:id/team/:userId` | Admin or `clients.team.manage` in scope | Deactivates the membership and the member designations. |
| GET | `/api/v1/clients/:id/roles` | authenticated | In-scope only. |
| POST | `/api/v1/clients/:id/roles` | Admin or `clients.team.manage` in scope | Designates an employee (transactional; replica set required). |
| DELETE | `/api/v1/clients/:id/roles/:assignmentId` | Admin or `clients.team.manage` in scope | Removes a designation. |

## 6. Endpoints implemented (Steps 7–11)

Conventions: cursor pagination (`limit`, `cursor`), Zod validation at the
boundary (failures are 422), optimistic concurrency via `expectedVersion`
(409 on mismatch), audit + activity records on mutations.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/projects` | authenticated | Scope-filtered (Admin all / Manager member clients / Employee assigned projects); filters: `clientId`, `status`, `type`, `managerId`, `search`. |
| POST | `/api/v1/projects` | Admin | Creates a project; manager gains membership. |
| GET | `/api/v1/projects/:id` | authenticated | Detail with leaf-task progress; out-of-scope 404. |
| PATCH | `/api/v1/projects/:id` | Admin or `clients.manage` in scope | Fields + manager (never status/client). |
| PATCH | `/api/v1/projects/:id/status` | Admin or `clients.manage` in scope | Status only; never touches tasks. |
| GET | `/api/v1/projects/:id/activity` | authenticated | In-scope only; audit trail. |
| GET | `/api/v1/clients/:id/projects` | authenticated | Projects of one client, scope-filtered. |
| GET | `/api/v1/tasks` | authenticated | Scope-filtered; filters: `projectId`, `clientId`, `status`, `priority`, `assignedUserId`, `assignedJobRoleId`, `approverId`, `approvalRequired`, `due`, `search`. |
| GET | `/api/v1/projects/:id/tasks` | authenticated | Tasks of one project, scope-filtered. |
| POST | `/api/v1/projects/:id/tasks` | Admin or Manager in scope | Assignment validated (active, holds role, client member). |
| GET | `/api/v1/tasks/:id` | authenticated | Detail with parent context + progress; out-of-scope 404. |
| PATCH | `/api/v1/tasks/:id` | Admin / Manager in scope; assignee may edit description + due date | Never status or assignee. |
| PATCH | `/api/v1/tasks/:id/assignment` | Admin or Manager in scope | Re-validates eligibility every time. |
| GET | `/api/v1/tasks/:id/activity` | authenticated | In-scope only. |
| GET | `/api/v1/tasks/:id/subtasks` | authenticated | In-scope only. |
| POST | `/api/v1/tasks/:id/subtasks` | Admin or Manager in scope | One level; same-project inherited; deadline warnings surfaced. |
| POST | `/api/v1/tasks/:id/start` | Assignee or editor | To Do → In Progress; needs assignee. |
| POST | `/api/v1/tasks/:id/submit` | Assignee or editor | In Progress → Awaiting Approval (approval-required only). |
| POST | `/api/v1/tasks/:id/approve` | Designated approver in scope | Awaiting Approval → Done; no self-approval; parent guards. |
| POST | `/api/v1/tasks/:id/revise` | Designated approver in scope | Reason required; Awaiting Approval → In Progress. |
| POST | `/api/v1/tasks/:id/complete` | Assignee or editor | In Progress → Done (no-approval only); parent guards. |
| POST | `/api/v1/tasks/:id/cancel` | Admin or Manager in scope | Reason required; any actionable state → Cancelled. |
| POST | `/api/v1/tasks/:id/block` | Assignee or editor | Reason required; To Do/In Progress → Blocked. |
| POST | `/api/v1/tasks/:id/unblock` | Admin or Manager in scope | Reason required; Blocked → To Do. |
| POST | `/api/v1/tasks/:id/reopen` | Admin or Manager in scope | Reason required; Done/Cancelled → In Progress. |
| GET | `/api/v1/my-tasks` | authenticated | Own assignments with project/client/parent names. |
| GET | `/api/v1/approvals/queue` | authenticated | Awaiting Approval where caller is approver, scope-filtered. |
| GET | `/api/v1/dashboard/summary` | authenticated | Role-scoped aggregates; never leaks unauthorized work. |

## 7. Endpoints implemented (Phase 4)

Conventions: template administration is **Admin-only**; Managers may only read
published templates and generate projects within their authorized client scope
(need the `projects.create_from_template` capability; Admins implicitly hold it).
Generation endpoints are mounted under `/projects/from-template*` **before**
`/projects/:id`. Zod failures are 422; optimistic-concurrency mismatches are 409.

### Templates (Admin-managed; Managers read published only)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/templates` | Admin (all), Manager (published only) | Filters: `status`, `type`, `search`; cursor pagination. |
| POST | `/api/v1/templates` | Admin | Creates a template plus version-1 draft; optional initial content. |
| GET | `/api/v1/templates/:id` | Admin or published | Detail with version list and draft pointer; non-Admins see published only. |
| PATCH | `/api/v1/templates/:id` | Admin | Name, description, type (never the stable `key`). |
| PUT | `/api/v1/templates/:id/draft` | Admin | Replaces the full draft content (nodes + dependencies). |
| POST | `/api/v1/templates/:id/draft` | Admin | Ensures a draft exists (clones the published version if needed); returns it. |
| POST | `/api/v1/templates/:id/validate` | Admin | Runs graph validation on the persisted draft (or a given version); returns issues. |
| POST | `/api/v1/templates/:id/publish` | Admin | Publishes the draft; archives the previous published version; opens a fresh draft. |
| POST | `/api/v1/templates/:id/archive` | Admin | Retires a template (reason required); hidden from project creation. |
| GET | `/api/v1/templates/:id/versions/:version` | Admin or published | Full node/dependency content of one version. |

### Project generation from a template

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/projects/from-template/preview` | `projects.create_from_template` + client scope | Server-validated preview built from the exact expansion used at creation. |
| POST | `/api/v1/projects/from-template` | `projects.create_from_template` + client scope | Atomically creates the project graph; 201 with `idempotentReplay`. |

`POST /projects/from-template` requires an `idempotencyKey` (8–120 chars).
Replaying the same key with an equivalent payload returns the original project
as `idempotentReplay: true`; the same key with a different payload returns 409
`CONFLICT`. Managers generating for an out-of-scope client receive 404 (IDOR
protection). The response envelope is
`{ data: { project: { id, name, … }, templateId, templateVersion, taskCount, subtaskCount, dependencyCount, warnings, idempotentReplay } }`.

## 8. Endpoints implemented (Phase 5 — notifications)

Conventions: self-service routes require an active session and are scoped to the
caller's own notifications/consent; workspace administration is **Admin-only**.
Zod failures are 422. The webhook is mounted with a raw body parser **before**
the global `express.json()`.

### Notification centre and consent (active session)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/notifications` | Own notifications; `notificationCenterQuerySchema` (filters + cursor). |
| GET | `/api/v1/notifications/unread-count` | Own unread count. |
| POST | `/api/v1/notifications/read-all` | Mark all own as read. |
| POST | `/api/v1/notifications/:id/read` | Mark one own notification read; 404 if not the caller's. |
| POST | `/api/v1/me/notification-consent` | Update own WhatsApp number/opt-in (`whatsappConsentInputSchema`). |

### Admin notification administration (Admin only)

| Method | Path | Notes |
| --- | --- | --- |
| GET / PATCH | `/api/v1/notification-settings` | Channel config (enabling sets `activatedAt`). |
| GET / PATCH | `/api/v1/notification-settings/templates` | Per-event template mappings. |
| GET | `/api/v1/notification-settings/stats` | Outbox statistics. |
| GET | `/api/v1/notification-settings/integration` | Provider/channel integration status. |
| GET | `/api/v1/notification-logs` | Delivery attempt log (sanitized). |
| POST | `/api/v1/notification-outbox/:id/retry` | Requeue a `failed` record; 404 if none. |

### Webhook (public, verified)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/webhooks/whatsapp` | Echoes `hub.challenge` when the verify token matches. |
| POST | `/api/v1/webhooks/whatsapp` | Verifies `X-Hub-Signature-256` over the raw body, then advances delivery status; unknown IDs ignored with 200. |
