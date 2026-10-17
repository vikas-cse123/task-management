# 04 — Data Model (Phases 1–2)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§16 and §25.4. Phase 1 implements identity, departments, job roles, users,
clients, and client role assignments. Phase 2 adds `projects`, `tasks` and
`taskActivities`. Later collections are listed so decisions remain compatible.

Better Auth manages its own authentication collections through the MongoDB
adapter. Do not create redundant identity records. The reference strategy is
recorded in [adr/0004-better-auth-identity-strategy.md](./adr/0004-better-auth-identity-strategy.md).

> **Implementation status (updated after the shared-contracts / database-foundation step).**
> Implemented in `packages/db`: `departments`, `jobRoles`, `clients`,
> `clientTeamMembers`, `clientRoleAssignments`, `auditLogs`. The application
> `users` profile collection is **deferred** to the authentication step (the
> profile-store decision is open item 10). Until then, applications reference
> users by Better Auth `ObjectId` and validate assignable employees through the
> `EmployeeDirectory` abstraction.

## 1. Phase 1 collections

### users (deferred to the authentication step)
Application profile linked to the Better Auth identity.

| Field | Notes |
| --- | --- |
| `authUserId` | Reference to the Better Auth identity (unique). No duplicate identity system. |
| `name` | Display name. |
| `email` | Login email (unique). |
| `whatsappNumber` | E.164 format. |
| `accessLevel` | `Admin` \| `Manager` \| `Employee`. |
| `status` | `active` \| `inactive` (deactivated users lose access). |
| `mustChangePassword` | Forces password change on first login. |
| `whatsappOptIn` | `{ consented, consentedAt, source }`. |
| `capabilities` | Optional granted capabilities (subset of `CAPABILITIES`). |
| `jobRoleIds` | One or more job-role references (may span departments). |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `email`, unique `authUserId`, index `status`, index
`jobRoleIds`.

### departments
Seeded reference data with stable keys: `creative_production`,
`performance_marketing`, `crm_data_operations`, `project_management`.

| Field | Notes |
| --- | --- |
| `key` | Stable identifier (unique). |
| `name` | Display name. |
| `description` | Admin-editable. |
| `createdAt` / `updatedAt` | Timestamps. |

### jobRoles
Seeded reference data with stable keys: `video_ad_script_writer`,
`video_editor`, `graphic_designer`, `performance_marketer`,
`crm_data_executive`, `project_manager`.

| Field | Notes |
| --- | --- |
| `key` | Stable identifier (unique). |
| `name` | Display name. |
| `departmentId` | Owning department. |
| `description` | Admin-editable. |
| `createdAt` / `updatedAt` | Timestamps. |

Rules: Admin may manage descriptions and settings; **deletion of referenced
records is blocked**; stable identifiers are preserved.

### clients

| Field | Notes |
| --- | --- |
| `name` | Unique display name. |
| `status` | Client status (`active` \| `inactive`; minimal set — see open item 9). |
| `primaryManagerId` | The principal responsible Better Auth user (Manager). Nullable. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `name`, index `status`, index `primaryManagerId`. Optimistic
concurrency enabled (`__v`).

### clientRoleAssignments
Designated employee per client and functional job role.

| Field | Notes |
| --- | --- |
| `clientId` | Reference to `clients`. |
| `jobRoleId` | Reference to `jobRoles`. |
| `userId` | Reference to the Better Auth user. |
| `isPrimary` | Primary designated assignment. |
| `isActive` | Active status. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes / rules:
- Unique compound index on `{ clientId, jobRoleId, userId }`.
- Unique **partial** index on `{ clientId, jobRoleId }` where `isPrimary: true`
  and `isActive: true` → one active primary designated employee per client/role.
- Designated assignee must be an **active** employee holding the job role.
- Creating/updating a designated assignment auto-creates the client's team
  membership in the same transaction, and demotes any previous primary.
- Optimistic concurrency enabled (`__v`).

### clientTeamMembers
Active client team membership that defines Manager scope.

| Field | Notes |
| --- | --- |
| `clientId` | Reference to `clients`. |
| `userId` | Reference to the Better Auth user. |
| `roleInTeam` | `manager` \| `member` (default `member`). |
| `isActive` | Active status. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `{ clientId, userId }`, `{ clientId, isActive }`,
`{ userId, isActive }`. Memberships are deactivated, never deleted.

### auditLogs
Sanitized audit history (no TTL in MVP).

| Field | Notes |
| --- | --- |
| `actorId` | Better Auth user who performed the action (nullable). |
| `action` | Action identifier (from `AUDIT_ACTIONS`). |
| `entityType` / `entityId` | Target record. |
| `previousValue` / `newValue` | Sanitized change payload. |
| `notes` | Optional. |
| `createdAt` | Timestamp (append-only; no `updatedAt`). |

Indexes: `{ entityType, entityId, createdAt }`, `{ actorId, createdAt }`,
`{ createdAt }`. Never store plaintext passwords or secrets.

### projects (Phase 2)

One client owns many projects; a project belongs to exactly one client.

| Field | Notes |
| --- | --- |
| `clientId` | Reference to `clients` (immutable after creation). |
| `name` | Display name (unique per client). |
| `description` | Nullable. |
| `type` | `campaign` \| `onboarding` \| `general`. |
| `status` | `planned` \| `in_progress` \| `live` \| `on_hold` \| `completed` \| `cancelled`. Separate from task statuses; changing it never touches tasks. |
| `managerId` | Assigned Project Manager (Better Auth user, nullable). Coordination role only — never an access-level promotion or permission grant. Assigning one auto-activates their client team membership. |
| `startAt` / `targetAt` | Nullable UTC datetimes; target must not precede start. |
| `templateId` / `templateVersion` | Reserved for Phase 4; stored, never acted on. |
| `createdBy` / `updatedBy` | Actors. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `{ clientId, name }`, `{ clientId, status }`, `{ managerId }`,
`{ status, updatedAt }`. Optimistic concurrency enabled (`__v`).

### tasks (Phase 2)

Individually assignable work records; subtasks reuse this collection via
`parentTaskId` (one level only, enforced server-side).

| Field | Notes |
| --- | --- |
| `projectId` | Reference to `projects` (immutable; subtasks inherit the parent's). |
| `parentTaskId` | Nullable; set only for subtasks. |
| `title` / `description` | Title max 200 chars. |
| `assignedUserId` | Nullable = explicit unassigned state (`Needs Assignment` derived flag). |
| `assignedJobRoleId` | Required whenever an assignee is set. |
| `dueAt` | Nullable UTC datetime. Overdue is derived, never a status. |
| `priority` | `low` \| `medium` \| `high` \| `urgent` (default `medium`). |
| `status` | Exactly `blocked` \| `todo` \| `in_progress` \| `awaiting_approval` \| `done` \| `cancelled`. Changed only through the transition engine. |
| `approvalRequired` / `approverId` | Designated approver must be an active client-team member; no self-approval. |
| `submittedBy` / `submittedAt`, `approvedBy` / `approvedAt`, `completedAt` | Workflow timestamps. |
| `revisionCount` | Revision rounds requested. |
| `sopUrl` / `referenceUrl` | Optional links (no file hosting). |
| `sourceMeetingId` | Reserved for Phase 6; stored, never acted on. |
| `createdBy` / `updatedBy` | Actors. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: `{ projectId, status }`, `{ projectId, parentTaskId }`,
`{ assignedUserId, status }`, `{ approverId, status }`,
`{ status, dueAt }`, `{ dueAt }`. Optimistic concurrency enabled (`__v`).

Rules: assignee must exist, be active, hold the job role, and belong to the
client team; approver must be an active client-team member; a parent cannot
complete while required subtasks are unfinished; progress = completed
non-cancelled leaves / total non-cancelled leaves.

### taskActivities (Phase 2)

Durable per-task history (user-visible), complementing the compliance audit
log which receives parallel entries for critical changes.

| Field | Notes |
| --- | --- |
| `taskId` / `actorId` | Task and actor (actor nullable). |
| `action` | Audit-action vocabulary (`task.create`, `task.submit`, …). |
| `previousValue` / `newValue` | Sanitized state payloads. |
| `notes` | Optional reason/remark. |
| `createdAt` | Timestamp (append-only). |

Index: `{ taskId, createdAt }`.

## 2. Later-phase collections (design-compatible, not implemented yet)

`taskDependencies`, `templates`,
`templateNodes`, `meetings`, `meetingActionItems`, `notificationOutbox`,
`notificationLogs`.

Key forward-compatibility decisions:

- `tasks.parentTaskId` is stored nullable so deeper nesting can be introduced
  later; v1 exposes only one subtask level.
- Dependency endpoints must remain **same-project**; cycles/self/duplicates are
  rejected in application logic.
- `clientRoleAssignments` keeps client membership separate from primary role
  mappings, so later automatic assignment can resolve roles without DB
  redesign.
- Audit/activity records are append-only and sanitized.

## 3. General database rules

Explicit schemas, schema validation, ObjectId references where applicable,
appropriate and unique indexes, short transactions, optimistic concurrency where
appropriate, no oversized embeds, and protection against cross-client references
that violate the project hierarchy.
