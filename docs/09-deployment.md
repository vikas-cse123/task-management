# 09 — Deployment

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§15.9. Hosting: **AWS EC2**. No Docker, no Docker Compose.

## 1. Topology

```
Internet → Nginx (443, TLS) →  ├── static SPA (Vite build) on same origin
                                └── reverse proxy /api → Express (127.0.0.1:PORT)
PM2 ─┬── Express API process
     └── Worker process (Agenda v6)
MongoDB Atlas (managed)
```

Same-origin serving means **no CORS package** is needed; the browser talks to one
origin for both the SPA and the API (see
[adr/0002-same-origin-no-cors.md](./adr/0002-same-origin-no-cors.md)).

## 2. Frontend

- Vite production build.
- Nginx serves the static files.

## 3. Backend and worker

- Node.js running Express; separate Node.js background worker.
- **PM2** process management: restart on failure, startup on server reboot.
- Worker runs continuously to schedule task deadlines, due-soon/overdue alerts,
  escalations, meeting reminders, retries, and outbox processing.

## 4. Networking and TLS

- Nginx reverse proxy.
- HTTPS with Let's Encrypt via Certbot.
- Restricted inbound ports.
- Server-side secrets (never in the browser, never in Git).

## 5. Operations

- Application logs and worker logs.
- Health checks.
- Monitoring and error reporting.
- Database backups and **tested restorations**.
- Optional GitHub Actions deployment.

## 6. Environment configuration

- Zod-validated environment variables.
- Environment-specific configuration.
- `.env.example` committed **without secrets**; real `.env` files are ignored.

Required variables (Phase 1 foundation):

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production`. |
| `API_PORT` | Express listen port. |
| `API_HOST` | Express bind host. |
| `LOG_LEVEL` | Pino log level. |
| `MONGODB_URI` | MongoDB connection string. |
| `BETTER_AUTH_SECRET` | Session signing secret. |
| `BETTER_AUTH_URL` | Public base URL. |
| `WEB_ORIGIN` | Trusted browser origin(s) for the SPA. |
| `INITIAL_ADMIN_EMAIL` | Initial Admin email (bootstrap only). |
| `INITIAL_ADMIN_NAME` | Initial Admin display name (bootstrap only). |
| `INITIAL_ADMIN_PASSWORD` | Initial Admin password (bootstrap only). |
| `WORKER_PROCESS_EVERY` | Agenda polling interval. |
| `AGENDA_DB_COLLECTION` | Agenda job collection name. |

`DEFAULT_TIMEZONE` (`Asia/Kolkata`) currently lives in
`packages/shared/src/constants.ts` rather than the environment.

Later phases add WhatsApp Cloud API and webhook-verification variables.

## 7. Security review checklist (Phase 7)

HTTPS, password hashing, protected sessions, server-side permissions,
client/project isolation, input validation, NoSQL-injection resistance, indexes,
concurrency protection, safe transactions, credential redaction, rate limiting,
secure webhook validation, protected environment variables, backups + restore
tests.
