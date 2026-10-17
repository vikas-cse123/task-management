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
- Public signup is disabled (library level + surfaced as 404/403).
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
