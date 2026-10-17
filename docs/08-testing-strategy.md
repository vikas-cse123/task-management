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

Task/subtask, dependency, notification, and meeting test suites are defined in
§19 and are executed in Phases 2–6. API tests use Supertest; E2E flows use
Playwright.

## 6. Playwright end-to-end procedure (Step 6)

E2E runs against the **real** API + SPA on an **isolated** database that is
rebuilt before every run. Status at Phase 1 completion: **18/18 green**
(12 scenarios + 4 HTTP security checks + settings/profile coverage).

Specs (`apps/web/e2e`):

| File | Coverage |
| --- | --- |
| `auth.spec.ts` | Scenarios 1 (admin login), 4 (first-login password change), 10 (logout/session). |
| `employees.spec.ts` | Scenarios 2 (employee creation + one-time password), 3 (multiple job roles). |
| `clients.spec.ts` | Scenarios 5 (client creation), 6 (team + designated roles), 7 (manager authorized), 8 (manager unauthorized). |
| `permissions.spec.ts` | Scenario 9 (employee restrictions). |
| `responsive.spec.ts` | Scenario 11 (mobile drawer, 390×844). |
| `workflow.spec.ts` | Scenario 12 (Admin → Employee → Client chain). |
| `security.spec.ts` | Signup disabled, admin paths blocked, 401s, manager create-403/edit-200, IDOR 404s. |
| `settings.spec.ts` | Reference-data label editing (Admin) + forbidden for others; profile screen. |

Tests run serially (`workers: 1`) because scenarios share fixture users;
mutating scenarios use fresh entities. Fixtures expire after one run
(passwords change), so **always rebuild before running**:

```bash
# 1. Isolated single-node replica set (transactions required), e.g. port 27018.
mongod --dbpath /tmp/mongo-rs-e2e --port 27018 --replSet rs0 --bind_ip 127.0.0.1
# then, once: replSetInitiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27018' }] })

# 2. API against the isolated database (port 4000; `dev` = `tsx watch`).
MONGODB_URI='mongodb://127.0.0.1:27018/interscale_e2e?directConnection=true' \
BETTER_AUTH_SECRET='<32+-char-secret>' BETTER_AUTH_URL='http://127.0.0.1:4000' \
WEB_ORIGIN='http://127.0.0.1:5174' NODE_ENV=test LOG_LEVEL=warn \
  pnpm --filter @interscale/api dev

# 3. Rebuild fixtures (drops the database; refuses non-`interscale_e2e` URIs).
MONGODB_URI='mongodb://127.0.0.1:27018/interscale_e2e?directConnection=true' \
BETTER_AUTH_SECRET='<same-secret>' E2E_ALLOW=true E2E_API_BASE='http://127.0.0.1:4000' \
  pnpm --filter @interscale/api exec tsx src/scripts/e2e-setup.ts

# 4. SPA on a port that does not collide with other projects (proxies /api).
pnpm --filter @interscale/web exec vite --port 5174 --strictPort --host 127.0.0.1

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
