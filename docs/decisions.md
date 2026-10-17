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

## Resolved during the foundation step

- **Manager edit conditions** — resolved by D6.
- **Departments/roles editable vs seed-only** — resolved by D7 (seed-only
  records, editable display name/description, stable keys).
- **Better Auth identity/reference strategy** — resolved by ADR 0004.

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
10. Whether the application profile lives on the Better Auth user document
    (via `additionalFields`) or in a separate `users` profile collection
    (ADR 0004 leaves this to the authentication step).

## Technical verifications completed

- Better Auth `1.7.10` + `@better-auth/mongo-adapter` `1.7.10` inspected: the
  adapter maps `id` ↔ `_id`, generates `ObjectId` by default, and uses singular
  model/collection names (`user`, `session`, `account`, `verification`).
- MongoDB transaction behavior verified against an isolated single-node replica
  set (`rs0`) on port 27018.

## Technical verifications still required

- Better Auth Admin plugin endpoint protection (authentication step).
- Supported version-specific Better Auth configuration APIs (authentication
  step).
- Agenda v6 Mongo backend configuration (notifications step).
- Cookie/CSRF protection specifics (authentication step).
