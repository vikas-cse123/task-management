# Interscale Marketing — Project & Team Management System

Internal Project & Team Management System for **Interscale Marketing**, a
performance-marketing agency for B2C travel agencies.

Hierarchy: **Workspace → Client → Project → Task → Subtask**. One agency
workspace, responsive web app, WhatsApp-driven notifications.

> **Status:** Steps 0–1 (documentation + monorepo foundation) only. Phase 1
> feature work has not started and requires explicit approval.

## Documentation

Start with [`docs/README.md`](docs/README.md). The complete, authoritative
requirements are preserved verbatim in
[`docs/00-product-requirements.md`](docs/00-product-requirements.md).

Permanent working instructions for AI/automation sessions live in
[`AGENTS.md`](AGENTS.md).

## Repository layout

```
apps/web        React + Vite SPA
apps/api        Express 5 REST API (/api/v1)
apps/worker     Agenda v6 background worker
packages/shared Shared enums, constants, Zod schemas, permissions
packages/db     MongoDB (Mongoose) connection + shared model infrastructure
docs/           Requirements, design docs, ADRs
```

## Requirements

- Node.js **>= 22.12.0** (LTS)
- pnpm **12.x** (`packageManager: pnpm@12.14.0`)
- MongoDB (Atlas, or a local single-node replica set for transactions)

## Getting started

```bash
pnpm install
cp .env.example .env        # then fill in real values (never commit .env)
pnpm build
pnpm test
```

Development:

```bash
pnpm dev:api        # API on http://127.0.0.1:4000
pnpm dev:web        # SPA on http://localhost:5173 (proxies /api to the API)
pnpm dev:worker     # background worker (requires MONGODB_URI)
```

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

These run in CI (`.github/workflows/ci.yml`).

## Approved technology

TypeScript monorepo (pnpm workspaces) · React/Vite · Express 5 · MongoDB
(Mongoose) · Better Auth · Agenda v6 worker · Tailwind + shadcn/ui ·
Vitest/Supertest/Playwright · AWS EC2 + Nginx + PM2 + HTTPS.

**Prohibited:** Docker, Docker Compose, Prisma, PostgreSQL, unnecessary Redis,
unapproved SaaS, object storage/file uploads. See
[`docs/01-technology-stack.md`](docs/01-technology-stack.md).

## License

Proprietary — internal use only.
