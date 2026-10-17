# AGENTS.md — Interscale Marketing Project & Team Management System

Permanent instructions for every OpenCode session working in this repository.
Read this file and [docs/00-product-requirements.md](./docs/00-product-requirements.md)
before changing anything.

## 1. What this project is

An internal, production-quality **Project & Team Management System** for
Interscale Marketing (a performance-marketing agency for B2C travel agencies).
Hierarchy: **Workspace → Client → Project → Task → Subtask**. One agency
workspace. Responsive web app. It is **not** a client-facing SaaS and **not** a
generic ClickUp clone.

## 2. Non-negotiable rules

1. Do not silently remove features, change workflows, substitute technologies,
   or invent requirements.
2. Do not implement the whole app at once. Work in approved, separately tested
   phases (see [docs/07-development-phases.md](./docs/07-development-phases.md)).
3. **Phases 1–4 (Steps 0–24) are complete and verified. Do not start Phase 5+
   (WhatsApp notifications, meetings, deployment) without
   explicit approval.**
4. Resolve ambiguities by asking; never decide business rules silently. The
   unresolved list is in [docs/decisions.md](./docs/decisions.md) (§22 of the
   spec).
5. Never commit secrets. Never log credentials. Never put secrets in the
   frontend.

## 3. Approved stack (do not substitute)

- TypeScript monorepo, **pnpm workspaces**, modular monolith + separate worker.
- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui,
  Radix primitives, Lucide, Sonner, TanStack Query + Table, React Hook Form +
  Zod, Recharts, FullCalendar (MIT plugins only), date-fns / date-fns-tz.
- Backend: Node.js LTS, Express 5, Mongoose, Zod, Pino + pino-http, Helmet,
  express-rate-limit (general `/api/v1` ceiling; Better Auth protects its own
  routes), OpenAPI/Swagger. REST under `/api/v1`.
- Database: **MongoDB** (Mongoose + native driver where adapters require it).
- Auth: **Better Auth** + `@better-auth/mongo-adapter` + Admin plugin,
  email/password, secure cookies, disabled public signup, one-time Admin
  bootstrap.
- Scheduling: **Agenda v6** + `@agendajs/mongo-backend`, separate worker.
- Testing: Vitest, Supertest, Playwright, MongoDB integration tests.

See [docs/01-technology-stack.md](./docs/01-technology-stack.md).

## 4. Prohibited (without explicit approval)

Docker · Docker Compose · Prisma · PostgreSQL · unnecessary Redis · unapproved
SaaS · object storage / file uploads · switching any approved technology.

## 5. Architecture layout

```
apps/web      React SPA (Vite)
apps/api      Express 5 REST API
apps/worker   Agenda v6 background worker
packages/shared  enums, constants, Zod schemas, types, permissions
packages/db      MongoDB (Mongoose) connection + shared model infra
docs/            source-of-truth requirements and design docs
```

Internal packages expose TypeScript source via `exports` → `./src/index.ts`.
Business logic lives in services; controllers stay thin; validate with Zod at
boundaries.

## 6. Security invariants

- Authorization is enforced **server-side** on every protected endpoint.
- Never trust client-provided access levels, job roles, assignees, or client IDs.
- Prevent IDOR: changing URL IDs must never expose out-of-scope records.
- Application access levels (Admin/Manager/Employee) stay **separate** from
  functional job roles and from Better Auth internal roles.
- Scope: Admin = all; Manager = active client-team membership; Employee =
  assigned/linked work + necessary context only.
- Audit critical permission/assignment/status changes; store sanitized records,
  never plaintext passwords.

Details: [docs/02-authentication.md](./docs/02-authentication.md),
[docs/03-authorization.md](./docs/03-authorization.md).

## 7. Code quality rules

1. TypeScript strict mode.
2. Maintainable, modular code; clear naming.
3. Thin controllers; business logic in services.
4. Zod at data boundaries.
5. No unnecessary dependencies; do not invent library APIs; verify installed
   versions.
6. Robust error handling; clear errors, never unexplained failures.
7. Add tests for critical business logic; do not skip failing tests.
8. Document meaningful architecture decisions (add an ADR under `docs/adr/`).
9. Keep secrets out of source control (real `.env` files are ignored).
10. Prefer simple solutions; stay within approved MVP scope.
11. Implement one testable feature at a time; a feature is complete only when
    its acceptance criteria pass.

## 8. Commands

Node.js **>= 22.12.0** is required (this machine runs Node 24). pnpm is the only
package manager.

```bash
pnpm install
pnpm dev:web        # Vite dev server (proxies /api to the API)
pnpm dev:api        # Express API
pnpm dev:worker     # Agenda worker
pnpm format         # Prettier write
pnpm format:check   # Prettier check (CI)
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit across workspaces
pnpm build          # build all workspaces
pnpm test           # Vitest across workspaces
pnpm --filter @interscale/web test:e2e   # Playwright E2E (needs E2E servers + fixtures)
```

CI runs `format:check → lint → typecheck → build → test`
(`.github/workflows/ci.yml`). Always run these before considering work done.

## 9. Environment

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`. Real
credentials for the initial Admin belong only in server-side environment
variables. `apps/worker` requires `MONGODB_URI`.

Database integration tests (`@interscale/db`) run only when `TEST_MONGODB_URI`
points at an isolated, replica-set-compatible MongoDB; otherwise they are
skipped. Never point destructive tests at development or production data.

Playwright E2E (`apps/web/e2e`) runs against a manually started API + Vite on
an isolated database rebuilt by `apps/api` `e2e-setup` (`MONGODB_URI` must
contain `interscale_e2e` and `E2E_ALLOW=true`). The full procedure is in
[docs/08-testing-strategy.md](./docs/08-testing-strategy.md) §6.

## 10. Documentation expectations

- The spec is preserved verbatim in `docs/00-product-requirements.md`.
- Keep `docs/decisions.md` and `docs/traceability.md` updated when decisions are
  approved.
- When a change materially affects architecture, security, or the data model,
  write an ADR and get approval.
- Do not claim requirements are "unavailable" because separate PDFs are absent;
  the full text is in this repository.
