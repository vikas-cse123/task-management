# 07 — Development Phases

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§20. Build in this order; implement one testable feature at a time; do not mark
a feature complete until its acceptance criteria pass.

## Phase 1 — Foundation and Authentication

**Build:** monorepo structure; frontend/backend foundation; shared schemas;
MongoDB connection; Better Auth; secure initial Admin bootstrap; login/logout;
employee management; access levels; departments; functional job roles; client
management; client-role assignments; server-side permission enforcement; basic
navigation.

**Acceptance:** employees see only their permitted client data and management
actions.

## Phase 2 — Core Project and Task Engine

**Build:** projects; tasks; subtasks; task statuses; due dates; priorities;
approvals; revisions; My Tasks.

**Acceptance:** parent tasks contain independently assigned and controlled
subtasks.

**Status: complete (Steps 7–12).** Projects API/UI with Admin creation,
scoped visibility, manager assignment and status flow; tasks with validated
assignment, six-status transition engine, mandatory-reason approvals and
revisions, real one-level subtasks with progress and completion guards; My
Tasks (TanStack Table), task detail, approval queue, expanded scoped
dashboard; 153 unit/integration tests and 34 E2E tests green; security audit
done. **STOP. Phase 3+ requires explicit approval.**

## Phase 3 — Dependencies and Automatic Assignment

**Build:** dependency graph; cycle detection; role-assignment resolution;
automatic task unlocking; event/audit history; downstream review warnings.

**Acceptance:** approving a Video Ad Script makes the correct Video Editor
subtask actionable.

## Phase 4 — Templates

**Build:** campaign template; client onboarding template; task-graph generation;
template versioning/configuration; automatic client-specific assignments.

**Acceptance:** creating a Singapore or Goa campaign produces the correct tasks,
subtasks, assignments, and prerequisites.

## Phase 5 — WhatsApp Notifications

**Build:** Meta WhatsApp Cloud API integration; approved templates; Agenda
worker; persistent outbox; due reminders; overdue alerts; escalations; delivery
logs; retry handling.

**Acceptance:** employees receive the correct notifications and retries do not
produce duplicate messages.

## Phase 6 — Meetings

**Build:** meeting list/calendar; scheduling; agendas; notes/decisions; action
items; convert action items to tasks; meeting reminders.

**Acceptance:** a completed meeting can generate linked follow-up tasks and all
reminders behave correctly.

## Phase 7 — Overview, Hardening, QA and Deployment

**Build/finalize:** Owner/Manager overview; employee workload dashboards;
Project Manager daily view; full security review; backup/restore procedures;
end-to-end UAT; AWS EC2 deployment; Nginx; PM2; HTTPS.

**Acceptance:** all defined MVP acceptance criteria pass.

---

## Current status

- **Step 0 (docs):** complete.
- **Step 1 (monorepo foundation):** complete and verified.
- **Foundation step (shared contracts + MongoDB domain models + identity
  verification):** complete. Implements shared Phase 1 contracts, the six Phase 1
  collections and indexes, the client-role assignment integrity service, the
  idempotent reference-data seed, and the Better Auth identity decision (ADR
  0004). Database integration tests pass against an isolated replica set.
- **Step 3 (authentication):** complete. Better Auth 1.7.10 with the MongoDB
  adapter, login-only credentials, server-managed profile fields (ADR 0005),
  blocked Admin-plugin HTTP surface, forced first-login password change, Admin
  bootstrap script, `/api/v1/me` + change-password endpoints, guarded frontend
  routes, and API auth tests on the in-memory adapter.
- **Step 4 (employees, access levels, departments, job roles, capabilities):**
  complete. Admin-only employee API (`/api/v1/users`) with listing/filters,
  create (one-time temporary password), profile/status/role/capability updates,
  session revocation, lockout protection and auditing; departments and job-role
  reference data endpoints with Admin-only label edits; `/team` Admin screen.
- **Step 5 (clients, client teams, designated roles, primary manager):**
  complete. Scope-filtered client API (`/api/v1/clients`) with Admin creation,
  `clients.manage` / `clients.team.manage` edits, team membership lifecycle,
  transactional designated-role assignment, primary-manager handling and
  auditing; `/clients` list and `/clients/:id` detail screens.
- **Step 6 (navigation shell, dashboard, security audit, E2E, docs, final
  report):** complete. Responsive sidebar layout with mobile drawer;
  real-data Overview dashboard; `/profile` and Admin-only `/settings`
  (reference-data labels) screens; twelve-point API security audit (one fix:
  removed the unused `express-rate-limit` dependency); Playwright E2E — 12
  scenarios plus 4 HTTP security checks plus settings/profile coverage, all
  executed green against the running app on an isolated database; quality
  gates green; Phase 1 declared complete. **STOP. Phase 2+ requires explicit
  approval.**
