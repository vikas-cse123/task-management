# 08 — Testing Strategy

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§19 and §25.7. Tests are mandatory; the app is not complete merely because pages
render.

## 1. Tooling

- **Vitest** — unit tests (`packages/shared`, service logic).
- **Supertest** — API integration tests (`apps/api`).
- **Playwright** — end-to-end tests.
- **MongoDB integration tests** — run against a replica-set-compatible
  instance so transactions can be tested.
- ESLint, Prettier, TypeScript strict mode, GitHub Actions CI as quality gates.

## 2. Quality gates (CI)

`format:check` → `lint` → `typecheck` → `build` → `test`.

## 3. Phase 1 test checklist

### Authentication
- Initial Admin account is created securely.
- Bootstrap cannot overwrite an existing Admin password (rerun is safe).
- Valid credentials log in; invalid credentials are rejected.
- Public signup is disabled at the library level (`POST
  /api/auth/sign-up/email` returns 400 with no session cookie); every
  Better Auth admin-plugin HTTP path returns 404.
- Non-Admin users cannot create employee accounts.
- Unauthorized access to admin functionality is rejected.
- Deactivated users cannot access protected resources.
- Sessions are invalidated appropriately (logout + revoke).
- Application access levels remain separate from functional job roles.

### Client / role
- Create multiple clients with multiple projects each (data-isolation test
  foundation).
- Client/project filters do not mix data.
- Two clients may have different Video Editors / Performance Marketers.
- One employee can hold multiple job roles (possibly across departments).
- One employee can work for several clients.
- A missing client-role assignment is identified (no arbitrary auto-assignment).
- Users cannot access unauthorized client/project information.

### Security
- Changing URL IDs cannot expose unauthorized records (IDOR).
- Employees cannot escalate their access level.
- Managers remain restricted to assigned scope.
- Unauthorized API calls are rejected even if frontend checks are bypassed.
- Audit history records required changes.
- Sensitive credentials never appear in logs.

### Concurrency
- Concurrent updates to the same record produce a clear conflict error, not a
  lost update.

### Mobile
- Login works at phone width.
- Navigation remains usable on smaller displays.
- Error/loading/empty states work correctly.

## 4. Database integration tests

Database integration tests require an isolated, **replica-set-compatible**
MongoDB, supplied through the `TEST_MONGODB_URI` environment variable.

- Each test file connects to a unique, randomly named database
  (`interscale_pm_test_*`) so parallel files never collide, and drops it on
  teardown. Destructive operations never touch development or production data.
- A Vitest `globalSetup` probe records whether the server is replica-set
  compatible. Transaction-dependent tests (`assignClientRole`, `withTransaction`)
  run only when it is; they are skipped otherwise.
- When `TEST_MONGODB_URI` is unset, integration tests are skipped (they do not
  fail the build) and only unit tests run.

Example — start an isolated single-node replica set for local test runs
(no Docker required):

```bash
mongod --dbpath /tmp/mongo-rs --port 27018 --replSet rs0 --bind_ip 127.0.0.1
# then, once: replSetInitiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27018' }] })
TEST_MONGODB_URI='mongodb://127.0.0.1:27018/?directConnection=true' pnpm test
```

CI intentionally does **not** provision MongoDB (provisioning a replica set
would require Docker, which is prohibited). Database integration tests run
against a self-hosted or explicitly provided test instance via
`TEST_MONGODB_URI`.

## 5. Later-phase checklists

Task/subtask, dependency and template test suites are defined in §19 and are
executed in Phases 2–4 (see the phase test records in §7–§10). The notification
suite runs in Phase 5 (see §10); the meeting suite runs in Phase 6. API tests use
Supertest; E2E flows use Playwright.

## 6. Playwright end-to-end procedure (Steps 6, 12, 18)

E2E runs against the API + SPA on an **isolated** database that is rebuilt
before every run: Phase 1 ended 18/18 green, Phase 2 ended 34/34 green,
Phase 3 ended 54/54 green, Phase 4 ended 69/69 green, Phase 5 ends 78/78 green
(all including full regression).

Spec files (`apps/web/e2e`) cover the Phase 1 scenarios (auth, employees,
clients, permissions, responsive, workflow, security, settings), the Phase 2
scenarios (`phase2-*`: projects, tasks, workflow, security, responsive),
the Phase 3 scenarios (`phase3-*`: dependencies, progression, safety,
security, UI, responsive, workflow), the Phase 4 scenarios (`phase4-*`:
templates, generation, security) and the Phase 5 scenarios (`phase5-*`:
notification centre, consent, Admin settings, assignment/ready/revision,
suppression, mobile).

Tests run serially (`workers: 1`) because scenarios share fixture users;
mutating scenarios use fresh entities. Fixtures expire after one run
(passwords change), so **always rebuild before running**:

```bash
# 1. Isolated single-node replica set (transactions required), e.g. port 27018.
mongod --dbpath /tmp/mongo-rs-e2e --port 27018 --replSet rs0 --bind_ip 127.0.0.1
# then, once: replSetInitiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27018' }] })

# 2. API against the isolated database (port 4000).
MONGODB_URI='mongodb://127.0.0.1:27018/interscale_e2e?directConnection=true' \
BETTER_AUTH_SECRET='<32+-char-secret>' BETTER_AUTH_URL='http://127.0.0.1:4000' \
WEB_ORIGIN='http://127.0.0.1:5174' NODE_ENV=test LOG_LEVEL=warn \
  pnpm --filter @interscale/api dev

# 3. Rebuild fixtures (drops the database; refuses non-`interscale_e2e` URIs).
MONGODB_URI='mongodb://127.0.0.1:27018/interscale_e2e?directConnection=true' \
BETTER_AUTH_SECRET='<same-secret>' E2E_ALLOW=true E2E_API_BASE='http://127.0.0.1:4000' \
  pnpm --filter @interscale/api exec tsx src/scripts/e2e-setup.ts

# 4. Production bundle on a dedicated port (proxies /api). NEVER the dev
# server for E2E: its file watcher reloads the app on Playwright artifact
# writes and wipes in-progress form state mid-test.
pnpm --filter @interscale/web build
pnpm --filter @interscale/web exec vite preview --port 5174 --strictPort --host 127.0.0.1

# 5. Run the suite (baseURL must match step 4).
pnpm --filter @interscale/web test:e2e
```

Environment notes:

- `WEB_ORIGIN` must exactly match the browser origin or Better Auth rejects
  the session requests.
- Bind the SPA explicitly (`--host 127.0.0.1`) and use a dedicated port: on
  machines running several Vite projects, a wildcard-bound neighbor can shadow
  `localhost` and the suite would test the wrong application.
- `apps/web/e2e/fixtures.json` is generated and git-ignored; never commit it.

## 7. Phase 2 test record (Steps 7–12)

Unit/integration (all executed, 0 skipped): shared 14, db 86 (project 7,
task 6, subtask 4, transitions 7, dashboard 1, plus Phase 1 suites), api 53
(projects 9, tasks 11, dashboard 2, plus Phase 1 suites).

E2E (Playwright/Chromium, real app + isolated `interscale_e2e` database,
34/34 green including the Phase 1 regression): the 24 required scenarios —
project creation, manager assignment, task creation/assignment/priority/
deadline, parent + subtasks, My Tasks, start, submit, approval visibility,
approve, revision, resubmission, progress, blocked parent, unrelated-client
and unrelated-task isolation, unauthorized approval, mobile tasks/projects,
session protection — plus HTTP security checks and settings/profile
coverage. Fixtures extended (`e2e-setup.ts`) with flow members, roles and a
campaign project; suites rerun from rebuilt fixtures every time.

## 8. Phase 3 test record (Steps 13-18)

Unit/integration (all executed, 0 skipped): shared 14, db 113 (dependency
6, workflow 8, assignment 5, downstream 8, plus Phase 1-2 suites), api 58
(tasks 14 with flows/dependencies/assignment/reviews, plus Phase 1-2
suites).

E2E (Playwright/Chromium, production preview bundle + isolated
`interscale_e2e` database, 54/54 green including the Phase 1/2 regression):
the 30 required scenarios - project creation, manager assignment, task
creation/assignment/priority/deadline, parent + subtasks, My Tasks, start,
submit, approval visibility, approve, revision, resubmit, progress, blocked
parent, unrelated isolation, unauthorized approval, mobile, session, plus
dependency add/view/circular/duplicate, blocked-start, readiness, approval
unlock, multi-prerequisite gating, auto-assignment, needs-assignment,
manual preservation, reopen/review/resolve, cancel, removal, graph
security, cross-client isolation, queue/dashboard refresh and mobile graph
views.

E2E hardening lessons: run against `vite preview` (the dev watcher reloads
on artifact writes); rebuild fixtures before every full run (stale
designations leak across runs); serialize multi-mutation flows (wait for
each edge); narrow paginated lists with search; always `expect` on HTTP
setup calls.

## 9. Phase 4 test record (Steps 19–24)

Unit/integration (all executed, 0 skipped; MongoDB transaction tests run
against the isolated replica set — not skipped): shared 14, db 159
(template validation/expansion/deadline/versioning/instantiation plus
Phase 1–3 suites), api 70 (templates and generation API plus Phase 1–3
suites). Total 243 passed, 0 failed, 0 skipped.

E2E (Playwright/Chromium, production preview bundle + isolated
`interscale_e2e` database, **69/69 green** including the full Phase 1–3
regression): the Phase 4 scenarios — Admin template list/create/editor/
save-draft/validate/publish/archive, published-version immutability, invalid
graph rejection, Manager published-only visibility, manager capability and
scope enforcement, server-validated preview, destination-specific generation
(Singapore/Goa), generated tasks/subtasks/roles/approvers/dependencies,
script blocked until brief Done, edit blocked until script approval, launch
blocked until required prerequisites Done, multiple video ads and matching
Meta ad-copy count, optional static/carousel not forced, onboarding access
prerequisites, CRM master data waits for personalization, final validation
waits for required tasks, relative-deadline calculation and past-due
warnings, missing-assignment visibility, idempotent replay/conflict,
cross-client isolation and mobile wizard views.

Fixtures (`apps/api/src/scripts/e2e-setup.ts`) seed the official templates and
add the flow users the wizard needs (`performanceMarketer`, `scriptWriter`,
`videoEditor`) with their client memberships; the `manager` fixture is granted
`projects.create_from_template`. Fixtures expire after one run (passwords
change), so rebuild before every run (procedure in §6).

## 10. Phase 5 test record (Steps 25–30)

Unit/integration (all executed, 0 skipped; MongoDB transaction tests run
against the isolated replica set — not skipped): shared 39, db 193
(notification service, dispatch, jobs, task hooks, deadlines, template
instantiation, plus Phase 1–4 suites), api 83 (notifications, webhooks, plus
Phase 1–4 suites). **Total 315 passed, 0 failed, 0 skipped, 0 not executed.**

Phase 5 DB suites cover: outbox persistence, notification logs, unique keys,
task-event integration, worker scheduling, reminder cancellation,
rescheduling, escalations, recurrence, consent enforcement, retries, stale
event handling, concurrent workers, delivery webhook status updates and data
isolation — using controllable clocks instead of waiting real days. API suites
cover the notification centre, consent, Admin settings/logs/retry and the
signature-verified webhook.

E2E (Playwright/Chromium, production preview bundle + isolated
`interscale_e2e` database, **78/78 green** including the full Phase 1–4
regression): the Phase 5 scenarios (`apps/web/e2e/phase5-notifications.spec.ts`
— 9 tests) cover Admin login, notification settings, template mappings, employee
consent, task assignment, task-ready after dependency completion, correct Video
Editor recipient, revision notification, missing assignment, blocked-task
suppression, in-app list, read/unread, failed delivery visibility, worker
status, due reminder scheduling, overdue, escalation, deadline rescheduling,
completion suppression, opt-out, unauthorized settings access prevention,
employee isolation and mobile views.

**Mock vs real provider.** Every WhatsApp send/retry/status flow is exercised
through the deterministic **Mock Meta provider**; no real employee receives a
message during tests. Live Meta Cloud API verification is **blocked** pending
credentials/approved templates.

> Run the DB suite with `VITEST_MAX_FORKS=1` to avoid intermittent worker
> startup crashes (`0xC0000409`) under host memory pressure; this is an
> environment constraint, not a test failure.
