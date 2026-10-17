# 04 — Data Model (Phase 1)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§16 and §25.4. Phase 1 implements identity, departments, job roles, users,
clients, and client role assignments. Later collections are listed so Phase 1
decisions remain compatible.

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

## 2. Later-phase collections (design-compatible, not implemented in Phase 1)

`projects`, `tasks`, `taskDependencies`, `taskActivity`, `templates`,
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
