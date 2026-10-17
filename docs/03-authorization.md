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
