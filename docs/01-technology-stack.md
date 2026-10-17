# 01 — Technology Stack

Final approved stack. Technologies must not be substituted or added without
explicit approval. The authoritative requirement text is in
[00-product-requirements.md](./00-product-requirements.md) (§15).

## Architecture

- TypeScript monorepo using **pnpm workspaces**.
- **Modular monolith** with a separate background **worker** process.
- REST API under `/api/v1`; single agency workspace; responsive web app.
- Shared TypeScript types and shared Zod schemas via `packages/shared`.

## Applications and packages

| Path | Role |
| --- | --- |
| `apps/web` | React SPA (Vite). |
| `apps/api` | Express 5 REST API. |
| `apps/worker` | Agenda v6 background worker. |
| `packages/shared` | Shared enums, constants, Zod schemas, types, permissions. |
| `packages/db` | MongoDB (Mongoose) connection and shared model infrastructure. |

## Frontend

- React + TypeScript + Vite + React Router.
- Tailwind CSS, shadcn/ui, Radix UI primitives, Lucide React, Sonner.
- TanStack Query (data) + TanStack Table (tables).
- React Hook Form + `@hookform/resolvers` + Zod (forms).
- Recharts (via shadcn/ui charts), FullCalendar React (**standard MIT-licensed
  plugins only**), `date-fns`, `date-fns-tz`.
- React built-in state for local UI state; Zustand only when genuinely needed.

## Backend

- Node.js LTS, TypeScript, Express 5.
- Mongoose ODM, Zod request validation, centralized error handling.
- Pino + pino-http (logging), Helmet, express-rate-limit (general `/api/v1`
  ceiling, reverse-proxy aware; Better Auth rate-limits its own routes),
  OpenAPI/Swagger.
- Organization: routes → controllers → services → models, plus auth /
  authorization / validation middleware. Business logic lives in services.

## Database

- **MongoDB** (initial environment: MongoDB Atlas Free Tier).
- Mongoose for application-domain collections; MongoDB native driver for
  adapters that require it (Better Auth, Agenda).
- Rules: explicit schemas, schema validation, ObjectId references, appropriate
  and unique indexes, short transactions, optimistic concurrency, no oversized
  embedded documents, application-level dependency-graph validation,
  replica-set-compatible transaction tests, backups + tested restores.
- MongoDB is definitive. **PostgreSQL and Prisma are prohibited.**

## Authentication

- Better Auth + `@better-auth/mongo-adapter` + Better Auth Admin plugin.
- Email/password, secure HTTP-only cookies, server-managed sessions, disabled
  public signup, one-time Admin bootstrap, Admin-created employee accounts.

## Scheduling

- Agenda v6 + `@agendajs/mongo-backend`, separate persistent Node.js worker,
  MongoDB-backed jobs. **Redis is not used** (unless a later approved change
  justifies it).

## Testing and quality

- Vitest (unit), Supertest (API integration), Playwright (E2E), MongoDB
  integration tests.
- ESLint, Prettier, TypeScript strict mode, GitHub Actions CI.

## Tooling

- pnpm, Git/GitHub, GitHub Actions, dotenv where appropriate, Zod environment
  validation, `.env.example` without secrets, automated type checking.

## Deployment

- AWS EC2, **no Docker**, Nginx static serving + reverse proxy, PM2 with
  restart-on-failure and startup-on-reboot, HTTPS via Let's Encrypt/Certbot,
  restricted inbound ports, server-side secrets, logs/health checks/backups.
  See [09-deployment.md](./09-deployment.md).

## File storage

MVP uses text descriptions, reference URLs, and external links for creative
assets. **No object storage, no Cloudflare R2, no file uploads.**

## Prohibited without explicit approval

Docker · Docker Compose · Prisma · PostgreSQL · unnecessary Redis · unapproved
SaaS services · switching the approved stack.

## Known verifications required (checked during Step 1)

- `pino-http` default/named import shape.
- `@agendajs/mongo-backend` `MongoBackend` constructor signature.
- Agenda `processEvery` accepts a string interval.
- `typescript-eslint@8` peer range requires TypeScript `<6.1.0` — TypeScript is
  pinned to `^6.0.3` (see [adr/0001-typescript-version-pin.md](./adr/0001-typescript-version-pin.md)).
