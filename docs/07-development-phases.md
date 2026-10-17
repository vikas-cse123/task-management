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
- Phase 1 authentication/authorization **feature** work: **not started**
  (awaiting approval).
