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

Phase 5 (WhatsApp notifications) adds server-side-only variables:

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_NOTIFICATIONS_ENABLED` | Emergency kill-switch (default `true`; channel still requires DB settings + credentials). |
| `WHATSAPP_PROVIDER` | `cloud` \| `mock` (`mock` rejected in production). |
| `WHATSAPP_APP_SECRET` | Verifies the `X-Hub-Signature-256` webhook signature. |
| `WHATSAPP_VERIFY_TOKEN` | Webhook GET verification token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Cloud API sender phone number ID. |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API access token (never logged/frontend). |
| `WHATSAPP_API_VERSION` | Graph API version (default `v21.0`). |
| `WHATSAPP_GRAPH_BASE_URL` | Graph base URL (default `https://graph.facebook.com`). |

**Production webhook URL requirement:** the webhook MUST be served over **HTTPS**
on a public, stable URL (Meta requires TLS); register
`https://<host>/api/v1/webhooks/whatsapp` and subscribe to message + status
events. Do not enable the channel until `WHATSAPP_APP_SECRET` and
`WHATSAPP_VERIFY_TOKEN` are set and the `interscale_*` templates are approved.

## 7. Security review checklist (Phase 7)

HTTPS, password hashing, protected sessions, server-side permissions,
client/project isolation, input validation, NoSQL-injection resistance, indexes,
concurrency protection, safe transactions, credential redaction, rate limiting,
secure webhook validation, protected environment variables, backups + restore
tests.

## 8. Local startup and first Admin (development)

Full procedure with placeholder values (never commit real credentials):

```bash
pnpm install
cp .env.example .env   # fill in MONGODB_URI, BETTER_AUTH_SECRET, INITIAL_ADMIN_*

# Transactional features need a replica set; single-node is enough locally:
mongod --dbpath /tmp/mongo-rs --port 27017 --replSet rs0 --bind_ip 127.0.0.1
# then, once: replSetInitiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })

MONGODB_URI='mongodb://127.0.0.1:27017/interscale_pm' pnpm --filter @interscale/db seed
INITIAL_ADMIN_EMAIL='admin@example.com' INITIAL_ADMIN_NAME='Site Admin' \
INITIAL_ADMIN_PASSWORD='a-strong-one-time-password' \
  pnpm --filter @interscale/api bootstrap:admin

pnpm dev:api    # http://127.0.0.1:4000
pnpm dev:web    # http://localhost:5173
```

The bootstrap script is idempotent: reruns never duplicate the Admin and never
reset an existing Admin password. The initial password is read from
server-side environment variables only — never logged, never sent to the
frontend. See the root `README.md` and `docs/02-authentication.md` §2.
