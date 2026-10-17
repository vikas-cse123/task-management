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

**Status: complete (Steps 7-12).** Projects API/UI with Admin creation,
scoped visibility, manager assignment and status flow; tasks with validated
assignment, six-status transition engine, mandatory-reason approvals and
revisions, real one-level subtasks with progress and completion guards; My
Tasks (TanStack Table), task detail, approval queue, expanded scoped
dashboard; 153 unit/integration tests and 34 E2E tests green; security audit
done. Phase 2 declared complete.

## Phase 3 — Dependencies and Automatic Assignment

**Build:** dependency graph; cycle detection; role-assignment resolution;
automatic task unlocking; event/audit history; downstream review warnings.

**Acceptance:** approving a Video Ad Script makes the correct Video Editor
subtask actionable.

**Status: complete (Steps 13-18).** Task-dependency engine (same-project
edges, self/duplicate/cycle/child-to-parent rejection, per-project
optimistic graph versioning); transactional auto-progression preserving
manual blocks; assignment resolver (template hook, designated primary,
manager) with opt-in auto-assign and recorded provenance; reopen/cancel
downstream safety with review flags and recorded resolutions; dependency
section, blockers, needs-assignment, reviews, counts and flags across
task/project/My Tasks screens; 185 unit/integration tests and 54 E2E tests
green; security audit done. **STOP. Phase 4+ requires explicit approval.**

## Phase 4 — Templates

**Build:** campaign template; client onboarding template; task-graph generation;
template versioning/configuration; automatic client-specific assignments.

**Acceptance:** creating a Singapore or Goa campaign produces the correct tasks,
subtasks, assignments, and prerequisites.

**Status: complete (Steps 19-24).** Template engine (stable-key identity; version-scoped
editable drafts; immutable published versions; graph validation); official
Campaign and Onboarding templates seeded idempotently; deterministic expansion
(variables, repeated creative groups, IST calendar-day deadlines, initial
statuses); atomic, idempotent project generation with role/approver resolution
and visible missing-assignment warnings; Admin template management screens and a
project creation wizard with live preview. Shared 14, db 159, api 70 unit/
integration tests and 69 E2E tests green (full Phase 1-3 regression); security
audit done. **Phase 4 declared complete. STOP. Phase 5+ requires explicit
approval.**

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
   gates green. Phase 1 declared complete.
- **Steps 7–11 (projects, tasks, subtasks, status engine, screens):**
  complete. Project model/contracts/service/API/UI with Admin creation,
  scoped visibility, manager assignment and status flow; task model with
  validated assignment, activity log and one-level subtasks with progress
  and completion guards; six-status transition engine with mandatory-reason
  approvals and revisions; My Tasks (TanStack Table), task detail, approval
  queue, expanded scoped dashboard, dependency-aware project view.
- **Step 12 (Phase 2 verification):** complete. Security audit (general
  rate limiting intentionally deferred; audit flagged one medium),
  unit/integration (shared 14, db 86, api 53 — 0 failed) and 34/34 E2E
  green; docs updated; Phase 2 declared complete.
- **Steps 13–17 (dependency engine, auto-progression, auto-assignment,
  downstream safety, dependency UI):** complete. `TaskDependency` model
  with same-project/cycle/child-to-parent rejection and per-project
  optimistic graph versioning; manual-vs-dependency blocker model;
  transactional unlocking that preserves manual blocks plus durable
  deduplicated readiness events; assignment resolver (template hook,
  designated primary, manager) with opt-in auto-assign and recorded
  provenance; reopen/cancel downstream safety with review flags and
  recorded resolutions; dependency section, blockers, needs-assignment,
  reviews, counts and flags on task/project/My Tasks screens.
- **Step 18 (Phase 3 verification):** complete. Full security audit
  (general `/api/v1` rate limiting restored — 1000 req/15 min per IP,
  proxy-aware, skipped in test env; Penpot/Miro, not Figma, noted as
  design hand-off); quality gates (format, lint, typecheck, build) green;
  unit/integration (shared 14, db 113, api 58 — 0 failed, 0 skipped);
  Playwright E2E 54/54 green on the production preview bundle against the
   isolated `interscale_e2e` database (Phase 1/2 regression + 30 required
   scenarios and security checks); docs updated. **Phase 3 declared
   complete. STOP. Phase 4+ requires explicit approval.**
- **Steps 19–22 (template contracts, models, services, seeds, API):**
   complete. Shared template/generation contracts; `templates`,
   `templateVersions`, `templateNodes`, `templateDependencies` and
   `projectGenerations` collections with immutability and single-published-
   version invariants; pure graph validation and deterministic expansion;
   deadline arithmetic in the IST display timezone; official Campaign and
   Onboarding seeds; Admin template API and capability/scope-guarded,
   idempotent generation API.
- **Steps 23–24 (frontend, verification, docs):** complete. Admin template
   list/editor and project creation wizard with live preview; security audit of
   the template/generation surface; quality gates (format, lint, typecheck,
   build) green; unit/integration (shared 14, db 159, api 70 — 0 failed,
   0 skipped, transactions executed) and Playwright E2E 69/69 green on the
   production preview bundle against the isolated `interscale_e2e` database
   (Phase 1–3 regression + Phase 4 scenarios and security checks); docs
   updated. **Phase 4 declared complete. STOP. Phase 5+ requires explicit
   approval.**
