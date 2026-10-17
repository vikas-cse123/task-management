# 04 — Data Model (Phases 1–4)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§16 and §25.4. Phase 1 implements identity, departments, job roles, users,
clients, and client role assignments. Phase 2 adds `projects`, `tasks` and
`taskActivities`. Phase 3 adds `taskDependencies`. Phase 4 adds `templates`,
`templateVersions`, `templateNodes`, `templateDependencies` and
`projectGenerations`. Later collections are listed so decisions remain
compatible.

Better Auth manages its own authentication collections through the MongoDB
adapter. Do not create redundant identity records. The reference strategy is
recorded in [adr/0004-better-auth-identity-strategy.md](./adr/0004-better-auth-identity-strategy.md).

> **Implementation status (updated after Phase 4).** All Phase 1–4 collections
> below are implemented in `packages/db`: `departments`, `jobRoles`, `clients`,
> `clientTeamMembers`, `clientRoleAssignments`, `auditLogs`, `projects`,
> `tasks`, `taskActivities`, `taskDependencies`, `templates`,
> `templateVersions`, `templateNodes`, `templateDependencies`,
> `projectGenerations`. The application user profile lives on the Better Auth
> `user` document (ADR 0005); applications reference users by Better Auth
> `ObjectId` and validate assignable employees through the `EmployeeDirectory`
> abstraction.

## 1. Core collections (Phases 1–3)

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

### taskDependencies (Phase 3)

Real prerequisite edges between tasks in one project. Version-scoped edge keys
from a template become real `taskDependencies` at instantiation; there is no
parallel dependency engine.

| Field | Notes |
| --- | --- |
| `projectId` | Reference to `projects`. |
| `predecessorTaskId` / `successorTaskId` | The successor waits on the predecessor. |
| `createdBy` / `updatedBy` | Actors. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `{ predecessorTaskId, successorTaskId }`,
`{ projectId, successorTaskId }`, `{ projectId, predecessorTaskId }`. Same
project, no self-edge, no duplicate, no cycle, no child-to-parent; graph edits
bump `projects.dependencyVersion` inside the same transaction.

## 2. Phase 4 collections (templates and generation)

### templates

An Admin-managed, reusable definition of a whole project workflow. Identity is
the stable `key`, never the editable name. A template is never bound to a client
in the definition — binding happens only at instantiation.

| Field | Notes |
| --- | --- |
| `key` | Stable unique identifier (lowercase snake_case, immutable). |
| `name` | Display name (editable). |
| `description` | Nullable. |
| `type` | `campaign` \| `onboarding` \| `general`. |
| `status` | `draft` \| `published` \| `archived`. |
| `currentPublishedVersion` | Number of the newest published version, or null. |
| `createdBy` / `updatedBy` | Actors. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `key`, `status`, `type`. Optimistic concurrency (`__v`).

### templateVersions

One version of a template. Nodes and dependencies live in version-scoped
collections keyed by the version, so a published version is **immutable by
construction** — editing always targets the single `draft` version.

| Field | Notes |
| --- | --- |
| `templateId` | Reference to `templates`. |
| `version` | Sequential, starting at 1. |
| `status` | `draft` \| `published` \| `archived`. |
| `notes` | Optional publish note (≤1000). |
| `basedOnVersion` | Version a draft was cloned from (nullable). |
| `createdBy` / `updatedBy` / `publishedBy` | Actors. |
| `publishedAt` | Nullable timestamp. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `{ templateId, version }`; unique **partial** `{ templateId }`
where `status: 'published'` → at most one published version per template;
`{ templateId, status }`. Optimistic concurrency (`__v`).

### templateNodes

A reusable task/subtask definition (one level of nesting only). Nodes are
definitions, never executable tasks.

| Field | Notes |
| --- | --- |
| `templateId` / `templateVersionId` / `version` | Owning template and version. |
| `nodeKey` | Stable, unique within the version. |
| `parentNodeKey` | Nullable; one-level subtask nesting. |
| `titleTemplate` / `descriptionTemplate` | Contain `{{variable}}` placeholders. |
| `requiredJobRoleKey` | Nullable functional job role. |
| `priority` | Task priority (default `medium`). |
| `approvalRequired` / `approverResolutionRule` | `project_manager` \| `none`. |
| `assignmentRule` | `designated` \| `project_manager` \| `none`. |
| `relativeDueRule` | `{ anchor, offsetDays, timeOfDay }` or null. |
| `isRequired` | Optional work is generated but not required. |
| `repeatGroup` | Nodes duplicated once per selected creative instance. |
| `sopUrl` / `referenceUrl` | Optional links. |
| `sortOrder` | Display order. |

Indexes: unique `{ templateVersionId, nodeKey }`,
`{ templateVersionId, sortOrder }`. Optimistic concurrency (`__v`).

### templateDependencies

A prerequisite edge between two template nodes, stored as version-scoped node
keys. At instantiation the keys map to the new real Task ids.

| Field | Notes |
| --- | --- |
| `templateId` / `templateVersionId` / `version` | Owning template and version. |
| `predecessorNodeKey` / `successorNodeKey` | Edge endpoints. |

Index: unique `{ templateVersionId, predecessorNodeKey, successorNodeKey }`.

### projectGenerations

Durable idempotency record for template-based project generation, written inside
the same transaction as the project graph.

| Field | Notes |
| --- | --- |
| `idempotencyKey` | Globally unique. |
| `fingerprint` | SHA-256 hash of the normalized request. |
| `actorId` | Generating user (nullable). |
| `clientId` / `templateId` / `templateVersion` | Source. |
| `projectId` | The project created by this request. |
| `warnings` | Generation warnings snapshot. |
| `createdAt` / `updatedAt` | Timestamps. |

Indexes: unique `idempotencyKey`, `{ clientId, createdAt }`.

## 3. Later-phase collections (design-compatible, not implemented yet)

`meetings`, `meetingActionItems`, `notificationOutbox`, `notificationLogs`.

Key forward-compatibility decisions:

- `tasks.parentTaskId` is stored nullable so deeper nesting can be introduced
  later; v1 exposes only one subtask level.
- Dependency endpoints remain **same-project**; cycles/self/duplicates are
  rejected in application logic.
- `clientRoleAssignments` keeps client membership separate from primary role
  mappings, so automatic assignment can resolve roles without DB redesign.
- Audit/activity records are append-only and sanitized.

## 4. General database rules

Explicit schemas, schema validation, ObjectId references where applicable,
appropriate and unique indexes, short transactions, optimistic concurrency where
appropriate, no oversized embeds, and protection against cross-client references
that violate the project hierarchy.
