# Phase 5 Completion Report — WhatsApp Notifications

Consolidated report required by `docs/phase5-implementation-prompt.md` §8.
Authoritative spec: [phase5-implementation-prompt.md](./phase5-implementation-prompt.md).
This report does **not** invent success; test counts are exact and every status
uses one of the five required labels.

Legend used throughout:

- **Implemented & tested locally** — code + automated tests executed.
- **Mocked Meta provider** — exercised through the deterministic mock provider.
- **Real Meta Cloud API** — requires live credentials/approved templates (**BLOCKED**).
- **Blocked** — pending external setup (Meta Business/Template approval).
- **Deferred** — belongs to Phase 6/7.

---

## 1. Overall Phase 5 status

**Complete and verified locally** against a mocked Meta provider. All Phase 5
scope in the spec §4 "Phase 5 Includes" is implemented, the full Phase 1–4
regression passes, and every quality gate is green.

**Live production messaging is BLOCKED and NOT enabled.** There are no real
Meta Business credentials, no approved Cloud API templates, and no production
activation in this environment; the WhatsApp channel is off by default
(`settings.enabled = false`) and the worker/API fail closed without credentials.
Requirement §"Production Activation Checklist" must be completed by an operator
before real sends occur.

## 2. Steps 25–30 summary

| Step | Scope | Status |
| --- | --- | --- |
| 25 | Shared notification domain: enums, event/outbox types, Zod schemas, WhatsApp signature + provider abstraction, template key catalogue. | Implemented & tested locally |
| 26 | Persistence: `notificationSettings`, `notificationInbox`, `notificationOutbox`, `notificationAttemptLog`, `campaignReviewSchedule`, `campaignReviewOccurrence` models + indexes; notification service (enqueue/consent/settings/logs). | Implemented & tested locally |
| 27 | Task/workflow integration: assignment, reassignment, ready, revision, deadline, overdue, escalation, campaign-review intents; transactional outbox write + idempotency. | Implemented & tested locally |
| 28 | Agenda v6 worker: dispatch, deadline-reminders, campaign-review jobs; lease claim/recovery, backoff, suppression reasons. | Implemented & tested locally |
| 29 | API + web: notification centre, consent, Admin settings/templates/logs/retry, webhook receiver; REST endpoints + screens (desktop + mobile). | Implemented & tested locally |
| 30 | Full verification, security audit, MongoDB integration tests, Playwright E2E, Phase 1–4 regression, quality gates, docs. | Implemented & tested locally; live-provider verification **BLOCKED** |

## 3. Files created and modified

**Created (representative; Phase 5)**

- Shared: `packages/shared/src/enums/notification.ts`,
  `packages/shared/src/schemas/notification.ts`,
  `packages/shared/src/whatsapp/{templates.ts,signature.ts,provider.ts}`.
- DB models: `packages/db/src/models/{notification-setting.ts,notification-inbox.ts,notification-outbox.ts,notification-attempt-log.ts,campaign-review-schedule.ts,campaign-review-occurrence.ts}`.
- DB services: `packages/db/src/services/{notification.service.ts,notification-dispatch.service.ts,notification-deadline.service.ts,campaign-review.service.ts,task-notifications.service.ts}`.
- Worker: `apps/worker/src/{agenda.ts,config/whatsapp.ts,jobs/{notification-dispatch.ts,deadline-reminders.ts,campaign-review.ts,register.ts}}`.
- API: `apps/api/src/{routes/notifications.ts,routes/webhooks.ts,services/notifications.ts}`.
- Web: `apps/web/src/{pages/NotificationsPage.tsx,hooks/useNotifications.ts,lib/notifications-api.ts,components/settings/NotificationSettingsSection.tsx}`.
- Tests: `packages/db/test/{notification-service.test.ts,notification-dispatch.test.ts,notification-jobs.test.ts,task-notification-hooks.test.ts,deadlines.test.ts}`,
  `apps/api/tests/{notifications.test.ts,webhooks.test.ts}`,
  `apps/web/e2e/phase5-notifications.spec.ts`.

**Modified (Phase 5 integration)**

- `packages/db/src/services/task.service.ts` (assignment notifications),
  `packages/db/src/services/task-transitions.service.ts`,
  `packages/db/src/services/workflow.service.ts` (ready/revision),
  `packages/db/src/services/template-instantiation.service.ts` (generated-task
  assignment notifications — bug fix, §26),
  `packages/db/src/services/task-notifications.service.ts` (session-aware load
  — bug fix, §26), `packages/db/src/index.ts`, `packages/db/src/connection.ts`.
- `packages/shared/src/schemas/primitives.ts` (query-integer coercion).
- `apps/api/src/{app.ts,routes/v1.ts,config/env.ts,services/tasks.ts}`.
- `apps/worker/src/{index.ts,config/env.ts}`.
- `apps/web/src/{app/router.tsx,components/layout/AppLayout.tsx,pages/ProfilePage.tsx,pages/SettingsPage.tsx,lib/dates.ts}`.
- `apps/api/src/scripts/e2e-setup.ts` (Phase 5 fixtures).
- Docs (§28) + `README.md` + `AGENTS.md`.

## 4. Database models/indexes

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `notificationSettings` | Singleton workspace channel config (enabled, activation time, sender, template mappings). | singleton key; unique mapping keys |
| `notificationInbox` | In-app notification record (always written). | unique `{recipientUserId, eventKey}`; `{recipientUserId, createdAt}`; `{recipientUserId, readAt}` |
| `notificationOutbox` | Durable WhatsApp send intent (transactional outbox). | unique `eventKey`; `{status, nextAttemptAt}`; `{recipientUserId, createdAt}` |
| `notificationAttemptLog` | Per-attempt dispatch log (sanitized). | `{outboxId, attempt}`; `{createdAt}` |
| `campaignReviewSchedule` | Per-project weekly review recurrence config. | unique `{projectId}` |
| `campaignReviewOccurrence` | One row per generated review occurrence. | unique `{projectId, periodKey}` |

Collections are pluralized by Mongoose (`notificationinboxes`,
`notificationoutboxes`, …). Forward-compatible with the Phase 4 §3
"later-phase collections" list in `04-data-model.md`.

## 5. Event/outbox architecture

- **Transactional outbox.** Every notification intent is written **inside the
  same MongoDB transaction** as the business change (task assignment, ready,
  revision, deadline change, completion). The worker dispatches later. No
  provider/network call ever occurs inside a business transaction (§21).
- **In-app is always written.** `notificationInbox` rows are created
  unconditionally; `notificationOutbox` rows are created only when the channel
  is enabled **and** the event→template mapping is enabled.
- **Two-phase safety.** Enqueue records intent + `eventKey`; dispatch revalidates
  live state (channel, activation boundary, mapping, consent, E.164 phone,
  task existence/terminal status, assignee match, unchanged deadline) and either
  sends or suppresses with an explicit machine-readable reason.
- **Statuses:** `pending | processing | sent | delivered | read |
  retry_scheduled | failed | suppressed | cancelled`. Delivery rank is monotonic
  (a `read` is never regressed by a later `delivered`).

## 6. Notification idempotency

- Unique `eventKey` on the outbox and unique `{recipientUserId, eventKey}` on the
  inbox. `enqueueNotification` returns `{ inboxId, outboxId, whatsappQueued,
  created }`; a deterministic `build*EventKey` covers each family:
  `task.assigned` uses `eventType:taskId:v{version}:recipient`,
  deadline events use `eventType:taskId:d{deadlineMs}:recipient`, campaign
  reviews use `campaign.review_due:projectId:periodKey:recipient`.
- Repeated workflow evaluation cannot create a duplicate intent. A duplicate-key
  write resolves to the existing record (§12).

## 7. Official Meta integration

- Provider abstraction `createWhatsAppProvider` (Web Crypto HMAC, Graph API
  send). **Fails closed**: without credentials it refuses to construct a live
  provider; `mock` is rejected when `NODE_ENV === 'production'`.
- Graph send uses `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_API_VERSION` (default `v21.0`), `WHATSAPP_GRAPH_BASE_URL`; errors are
  classified retryable/non-retryable and **never** include tokens or full phone
  numbers.

**Real Meta Cloud API: BLOCKED** (no credentials/approved templates here).

## 8. Approved template mappings

Template key catalogue mirrors Meta names (`interscale_*`): `task_assigned`,
`task_reassigned`, `task_ready`, `task_revision_requested`, `task_due_soon`,
`task_overdue`, `task_escalation`, `meeting_assigned`, `meeting_rescheduled`,
`meeting_reminder`, `campaign_review_due`. Admin manages the event→template
mapping via `PATCH /notification-settings/templates`; every mapping defaults
disabled, so no unmapped event is queued.

## 9. Consent and opt-out enforcement

- Consent lives on the Better Auth user (`whatsappNumber`, `whatsappOptIn`,
  `whatsappOptInAt`, `whatsappOptInSource`); the employee sets it via
  `POST /me/notification-consent`.
- Dispatch requires `whatsappOptIn === true` and a valid E.164 number; otherwise
  it suppresses (`no_consent`/`invalid_recipient`) while the in-app copy
  remains. Opt-out suppresses pending sends and blocks future sends; opting in
  does not replay historical suppressed messages (§11, §13).
- No consent is ever invented by the system (§8).

## 10. Webhook verification/security

- Webhook is mounted with `express.raw({ type: '*/*' })` **before** the global
  `express.json()`, so the exact raw body is verified.
- `GET /webhooks/whatsapp` echoes `hub.challenge` only when `hub.verify_token`
  matches `WHATSAPP_VERIFY_TOKEN`.
- `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` HMAC-SHA256 over the
  raw body with `WHATSAPP_APP_SECRET` using a constant-time compare; unsigned/wrong
  signatures are rejected. Unknown message IDs are ignored with `200`; delivery
  statuses advance only (never regress `read`). See §21 items 2–3.

## 11. Delivery tracking

- Sent → `sent`; Meta status webhooks advance `delivered` then `read`
  (monotonic). Failures set `failed` with a sanitized `lastError`;
  retryable failures schedule `retry_scheduled`. Every attempt appends a row to
  `notificationAttemptLog`.
- Failed deliveries are visible to Admins in the notification logs/stats screen
  (and "failed delivery" E2E scenario).

## 12. Task/workflow event integration

| Event | Trigger | Recipient |
| --- | --- | --- |
| `task.assigned` | Task created/assigned with an assignee | Assignee |
| `task.reassigned` | Assignee changed | New assignee (stale one suppressed) |
| `task.ready` | Dependencies satisfied / becomes actionable | Assignee |
| `task.revision_requested` | Approval requests a revision | Assignee |
| `task.due_soon` | Deadline scan within lead window | Assignee |
| `task.overdue` | Past deadline | Assignee |
| `task.overdue_escalation` | Overdue beyond escalation window | Project Manager |
| `campaign.review_due` | Weekly recurrence for Live projects | Project Manager |

Integration is from `task.service.ts`, `task-transitions.service.ts`,
`workflow.service.ts` and `template-instantiation.service.ts`; each writes the
intent transactionally.

## 13. Deadline reminder scheduling

- Deadline scan (`notification-deadline.service.ts`) runs on a batch limit,
  resolves each task's live deadline, and enqueues `task.due_soon` when inside
  the lead window (`DEFAULT_DUE_SOON_LEAD_HOURS = 24`).
- Completing/cancelling a task suppresses stale reminders; changing a due date
  produces a new `d{deadlineMs}` event key, so the old intent is superseded
  rather than duplicated (§24 §31 §88–§91 verified by controllable-clock tests).

## 14. Overdue and Manager escalation

- One `task.overdue` event per task/deadline; escalation fires only after the
  overdue window (`DEFAULT_ESCALATION_AFTER_HOURS = 24`) and only to the
  project's Project Manager, never the assignee (no self-escalation; no
  unauthorized escalation data). Escalation recipient resolution reads
  `ProjectModel.managerId` server-side.

## 15. Agenda worker reliability

- Agenda v6 + `@agendajs/mongo-backend`. Jobs: dispatch, deadline-reminders,
  campaign-review, registered in `jobs/register.ts`.
- Outbox claim uses a lease (`NOTIFICATION_CLAIM_LEASE_MS = 5 min`) with a Mongo
  `findOneAndUpdate` (`returnDocument: 'after'`); a crashed/slow worker's
  records are recovered by the lease-recovery sweep. **Worker restart does not
  duplicate events** (unique `eventKey` + status guards).
- Retries: exponential `computeBackoffMs(attempt)` (base 30 s, cap 30 min),
  bounded by `NOTIFICATION_MAX_ATTEMPTS = 5`, then terminal `failed` — no
  unbounded loops.

## 16. Weekly campaign review recurrence

- `campaignReviewSchedule` + `campaignReviewOccurrence` (unique
  `{projectId, periodKey}`) generate one review per period for projects in
  `Live` status; `Completed`/terminal projects stop recurring. Verified by
  controllable-clock job tests and E2E scenarios §25–§26.

## 17. In-app fallback

- The notification centre always has the in-app row even when WhatsApp is
  disabled, unconsented, unmapped, or failed. Read/unread, unread count and
  mark-all-read are per-recipient.

## 18. Admin settings/logs

- Admin-only: settings get/patch, template mappings, stats, integration status,
  notification logs, and manual retry (`POST /notification-outbox/:id/retry`).
- Retry only acts on a `failed` record and requeues it; it cannot force-send a
  suppressed/disallowed record.

## 19. Frontend screens

- Notification centre `/notifications` (list, read/unread, failed-delivery
  visibility, mobile layout).
- Profile: WhatsApp consent / phone opt-in.
- Settings (Admin): `NotificationSettingsSection` — channel enable, sender,
  template mappings, stats, logs, integration status, worker status, retry.
- Nav shows unread count; meetings stay hidden until Phase 6.

## 20. REST API endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/notifications` | Active session (own only) |
| GET | `/api/v1/notifications/unread-count` | Active session |
| POST | `/api/v1/notifications/read-all` | Active session |
| POST | `/api/v1/notifications/:id/read` | Active session (own only) |
| POST | `/api/v1/me/notification-consent` | Active session |
| GET/PATCH | `/api/v1/notification-settings` | Admin |
| GET/PATCH | `/api/v1/notification-settings/templates` | Admin |
| GET | `/api/v1/notification-settings/stats` | Admin |
| GET | `/api/v1/notification-settings/integration` | Admin |
| GET | `/api/v1/notification-logs` | Admin |
| POST | `/api/v1/notification-outbox/:id/retry` | Admin |
| GET/POST | `/api/v1/webhooks/whatsapp` | Public (signature/token verified) |

## 21. Security audit findings (Step 30.5)

Method: code review of the Phase 5 surface plus executed tests
(`apps/api/tests/{notifications,webhooks}.test.ts`,
`packages/db/test/*`, `apps/web/e2e/phase5-notifications.spec.ts`, full 78-test
E2E green). All 20 required checks:

1. **WhatsApp tokens server-side only** — `WHATSAPP_*` read only in
   `apps/api/src/config/env.ts` and `apps/worker/src/config/env.ts`; never sent
   to the SPA and never in API responses. ✅
2. **Public webhook signatures verified** — `verifyHubSignature`
   (`packages/shared/src/whatsapp/signature.ts`) HMAC over the raw body,
   constant-time compare, mounted before JSON parsing. ✅
3. **No forged delivery events** — unsigned/wrong-signature POSTs rejected;
   unknown IDs ignored (`200`); statuses advance-only. ✅
4. **No secret leakage in logs** — provider errors sanitized (no token/secret,
   no full phone); webhook handler logs no payload secrets. ✅
5. **No cross-client notification access** — centre/read endpoints filter by the
   actor's own `recipientUserId` (`notification.service.ts` `listCenter`). ✅
6. **No unauthorized settings changes** — settings/templates/stats/retry guarded
   by `requireAdmin()` in the router. ✅
7. **No unauthorized manual retries** — retry is Admin-only and limited to
   `failed` records. ✅
8. **No invented consent** — consent only via `POST /me/notification-consent`;
   dispatch requires stored `whatsappOptIn`. ✅
9. **No WhatsApp sending after opt-out** — opt-out suppresses pending and blocks
   future sends (dispatch revalidates consent). ✅
10. **No stale notifications to reassigned employees** — dispatch revalidates the
    current assignee; stale recipients are suppressed. ✅
11. **No provider calls during MongoDB transactions** — enqueue writes inbox +
    outbox only; all `provider.send` calls occur in the worker dispatch path,
    never inside `withTransaction`. ✅
12. **No duplicate intent on repeated evaluation** — unique `eventKey` +
    `{recipientUserId, eventKey}` with deterministic keys. ✅
13. **No unbounded retry loops** — `NOTIFICATION_MAX_ATTEMPTS = 5` then terminal
    `failed`. ✅
14. **No sensitive credentials in template parameters** — parameters are
    task/project/employee display values only. ✅
15. **No unauthorized Manager escalation data** — escalation targets only the
    project's Project Manager, resolved server-side. ✅
16. **No accidental mass historical sending** — `activatedAt` boundary suppresses
    records created before first enable; opt-in never replays history. ✅
17. **No task changes rolled back due to WhatsApp failure** — WhatsApp is by
    design outside the business transaction; a provider outage cannot roll back
    task writes. ✅
18. **No unsecured worker administration routes** — `apps/worker` exposes **no**
    HTTP server (no Express/`createServer`/`listen`; only Agenda jobs). ✅
19. **Safe environment configuration** — Zod-validated env; credentials optional
    and fail-closed; `mock` provider rejected in production;
    `WHATSAPP_NOTIFICATIONS_ENABLED` kill-switch. ✅
20. **Secure production webhook URL requirements** — documented: HTTPS-only
    public URL, verify token + app secret set, provider enabled only after
    approved templates (see §"Production Activation Checklist"). No plaintext/HTTP
    webhook is used; enforcement is operational (Meta requires HTTPS). ✅

No new security defects were found in the Phase 5 surface beyond the two
integration bugs fixed in §26 (both were functional, not exploitable).

## 22. Unit/integration test results

Executed against an isolated replica-set database (`TEST_MONGODB_URI`,
`VITEST_MAX_FORKS=1`); transaction-dependent tests executed, not skipped.

- `@interscale/shared`: **39 passed**, 0 failed, 0 skipped.
- `@interscale/db`: **193 passed**, 0 failed, 0 skipped (28 files).
- `@interscale/api`: **83 passed**, 0 failed, 0 skipped.
- **Total 315 passed, 0 failed, 0 skipped, 0 not executed.**

Phase 5 DB suites: `notification-service`, `notification-dispatch` (8),
`notification-jobs`, `task-notification-hooks`, `deadlines`,
`template-instantiation` (incl. the new generated-task assignment-notification
test). API suites: `notifications`, `webhooks`.

> Note: the default Vitest parallel pool intermittently crashes workers
> (`0xC0000409`, stack buffer overrun) under host memory pressure; the suite is
> run with `VITEST_MAX_FORKS=1` for deterministic results. This is an
> environment constraint, not a test failure.

## 23. Playwright E2E results

- `apps/web/e2e/phase5-notifications.spec.ts`: **9 passed**.
- **Full suite: 78 passed, 0 failed** (production `vite preview` bundle +
  isolated `interscale_e2e` database, serial `workers: 1`, fixtures rebuilt).

## 24. Phase 1–4 regression results

Included in the 78-test E2E run: authentication, employees, clients, roles,
permissions, projects, tasks/subtasks, approvals, dependencies, automatic
assignment, downstream review, campaign + onboarding template generation,
atomic generation, template versioning, My Tasks, dashboard, and existing mobile
workflows — **all green**, alongside the Phase 5 specs.

## 25. Live-provider tests executed or blocked

- **Executed:** all WhatsApp flows through the deterministic **mock** provider.
- **BLOCKED:** real Meta Cloud API sends, real delivery/read webhooks from Meta,
  and approved-template verification. No approved templates or credentials exist
  in this environment; the channel is disabled and fail-closed.

## 26. Bugs found/fixed

1. **Generated tasks never emitted assignment notifications.** Template
   instantiation inserted tasks directly, bypassing the task service hook.
   Fixed in `template-instantiation.service.ts` (`insertTasks` now calls
   `notifyTaskAssignment` per assigned generated task, in the generation
   transaction).
2. **`loadTaskContext` ignored the transaction session.** Inside the generation
   transaction the freshly created task was invisible to a sessionless
   `findById`, so notification context resolved to `null` and nothing queued.
   Fixed in `task-notifications.service.ts` to pass `options.session` to the
   task/project/client reads.
3. **Test-data fixes (not product bugs):** Phase 5 E2E tests 6 & 8 used an
   ineligible `employee` user for role overrides (422); switched to the eligible
   role users. `insertTask` test helper status typed `'todo' | 'done'` for
   typecheck. Minor lint (`let→const`, unused destructure).

Pre-existing, unchanged (documented, not Phase 5 defects): note-length mismatch
(Zod max 2000 vs 1000 audit fields), missing single-field indexes on
`taskDependencies`, non-atomic `ensureActiveMembership`.

## 27. Technical limitations

- Live Meta verification blocked (§25); production activation pending.
- Agenda provides at-least-once semantics; exactly-once dedupe relies on unique
  `eventKey` + status guards.
- DB integration tests require externally provided replica-set MongoDB (CI does
  not provision one; Docker is prohibited).
- `quotation.pdf` (~38 MB) is committed and not git-ignored (see §29).

## 28. Documentation changes

Updated: `README.md`, `AGENTS.md`, `docs/01-technology-stack.md`,
`docs/03-authorization.md`, `docs/04-data-model.md`, `docs/05-api.md`,
`docs/06-frontend.md`, `docs/07-development-phases.md`,
`docs/08-testing-strategy.md`, `docs/09-deployment.md`, `docs/decisions.md`,
`docs/traceability.md`, plus this report. `docs/00-product-requirements.md` is
preserved verbatim. Documented topics per §30.10: WhatsApp setup, Meta
prerequisites, approved template setup, consent, outbox architecture, worker
scheduling, retry strategy, webhook security, notification matrix, in-app
fallback, deadline changes, escalations, weekly review recurrence, local
development, environment variables, test procedures, mock-vs-real verification,
and the production activation checklist.

## 29. Git state

- Branch `main`; HEAD `a42cd66` (subject "phase 5 completed") — note: this
  commit actually contains Phase 4 work; the message is mislabeled.
- Untracked: `docs/phase5-implementation-prompt.md`, `docs/phase5-completion-report.md`.
- Flag: `quotation.pdf` (~38 MB) is committed and not git-ignored — remove or
  git-ignore before distributing the repository.

## 30. Readiness for Phase 6

**Ready for Phase 6 (Meetings), Phase 5 complete and verified locally.**
Meeting notification event types (`meeting.assigned`, `meeting.rescheduled`,
`meeting.reminder`) and template keys already exist in the catalogue, so Phase 6
can enqueue through the same outbox. Live WhatsApp provisioning remains the only
open external dependency and does not block Phase 6 development.

---

## Production Activation Checklist (operator)

1. Meta Business account + WhatsApp Business (Cloud API) app; obtain phone
   number ID and a permanent access token.
2. Create and get approval for the `interscale_*` message templates.
3. Set server-side env: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PROVIDER=cloud`
   (never in the frontend or source control).
4. Register the HTTPS webhook URL and subscribe to messages/statuses.
5. In Admin settings, enable the channel and each event→template mapping; this
   sets `activatedAt` (no historical flood).
6. Verify a single controlled assignment end-to-end, then confirm delivery/read
   statuses in the logs.
