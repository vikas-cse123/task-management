# INTERSCALE MARKETING — PHASE 5 COMPLETE IMPLEMENTATION

## Steps 25–30 | WhatsApp Cloud API, Automated Task Notifications, Agenda Worker, Deadline Reminders, Manager Escalations & Testing

# 0. ROLE AND OBJECTIVE

Act as a Principal Software Architect, Senior TypeScript Full-Stack Engineer, Meta WhatsApp Business Platform Integration Expert, Background Job Architect, MongoDB Database Engineer, Security Engineer and QA Lead.

You are continuing development of Interscale Marketing's internal Project & Team Management System.

Project directory:

C:\Users\User\Desktop\vikas\project-management

Git Bash equivalent:

/c/Users/User/Desktop/vikas/project-management

## CURRENT PROJECT STATUS

Phases 1–4 have been completed according to previous implementation reports.

Current features:

- Secure Better Auth authentication.
- Admin, Manager and Employee access levels.
- Employee functional job roles.
- Client-specific employee mappings.
- Project management.
- Task/subtask management.
- Approval and revision workflows.
- Dependency-driven automatic task unlocking.
- Automatic employee assignment.
- Reusable campaign/onboarding templates.
- Atomic project generation.
- Task activity and workflow events.
- Responsive frontend.

The Phase 4 report states:

- 243 unit/integration tests passed.
- 69 Playwright E2E tests passed.
- No failed or skipped tests.
- Existing Agenda v6 worker remains a scaffold.
- Workflow events are stored but WhatsApp notifications are not delivered.
- Weekly campaign review recurrence is not yet active.

Verify actual repository state before proceeding.

## YOUR ASSIGNMENT

Complete Phase 5 in one continuous implementation run:

STEP 25 — Notification Architecture, Persistent Outbox and Shared Contracts.

STEP 26 — Official Meta WhatsApp Cloud API Integration and Webhooks.

STEP 27 — Automated Task and Workflow Notifications.

STEP 28 — Agenda v6 Scheduling, Reminders, Escalations and Campaign Review Recurrence.

STEP 29 — Notification Management UI, Settings, Consent and Logs.

STEP 30 — Security, Integration Tests, E2E Verification and Documentation.

Complete all six steps sequentially.

Do not request approval between steps unless an essential credential, externally controlled Meta configuration, or material security decision requires user input.

Do not implement unrelated Phase 6 or Phase 7 features.

Do not claim successful real WhatsApp delivery unless it was actually verified with the provider.

STOP after Step 30.

---

# 1. READ EXISTING REPOSITORY AND REQUIREMENTS

Before making changes, read:

- AGENTS.md
- README.md
- docs/00-product-requirements.md
- docs/01-technology-stack.md
- docs/02-authentication.md
- docs/03-authorization.md
- docs/04-data-model.md
- docs/05-api.md
- docs/06-frontend.md
- docs/07-development-phases.md
- docs/08-testing-strategy.md
- docs/decisions.md
- docs/traceability.md
- Relevant ADR documents.

Inspect existing implementation:

- apps/api
- apps/web
- apps/worker
- packages/shared
- packages/db

Specifically inspect:

- Task assignment/reassignment services.
- Task transitions and approval services.
- Dependency workflow events.
- Client role assignments.
- Existing audit infrastructure.
- Project statuses.
- Better Auth user profiles and WhatsApp consent fields.
- Agenda worker configuration.
- Phase 4 generated weekly campaign review nodes.

Reuse existing functionality.

Do not introduce a second task engine, alternative user system, or duplicate workflow implementation.

Preserve approved architecture and business rules.

---

# 2. APPROVED TECHNOLOGY STACK

Mandatory existing stack:

- TypeScript strict.
- pnpm workspaces.
- Node.js LTS.
- Express 5.
- MongoDB/Mongoose.
- Better Auth.
- Zod.
- React/Vite.
- React Router.
- Tailwind CSS.
- shadcn/ui.
- TanStack Query.
- TanStack Table.
- React Hook Form.
- Pino/pino-http.
- Agenda v6.
- @agendajs/mongo-backend.
- Vitest.
- Supertest.
- Playwright.

WhatsApp integration:

**Official Meta WhatsApp Business Platform Cloud API.**

Use Meta's supported HTTP API, approved message templates and verified webhooks.

Do not use unofficial WhatsApp Web automation or browser-based message sending.

WhatsApp Max may be reused only after its actual integration and compliance are verified. Do not assume an undocumented integration exists.

No Docker, PostgreSQL, Prisma, Redis, unapproved SaaS, or unrelated messaging provider.

The application remains a modular monolith with a separate persistent Node worker.

---

# 3. PRE-IMPLEMENTATION REQUIREMENTS

Before Step 25:

1. Inspect Git status and existing commits.
2. Verify no secrets are tracked.
3. Preserve Phase 4 changes.
4. Review the existing Phase 4 testing baseline.
5. Run relevant regression checks.
6. Review documented technical issues.

The prior code review identified:

- Task reason/note length mismatch between Zod and MongoDB.
- Missing dependency lookup indexes.
- Risk of accidentally committing an unrelated quotation.pdf.
- Previously reported weak Admin credentials.
- Potential server-side secrets in a frontend environment file.

Verify these findings against the current repository.

Fix confirmed correctness/security blockers before adding notification functionality.

Do not print, copy, expose or commit secrets.

Do not silently reset Admin credentials or replace environment secrets.

Report user-controlled credential rotation that cannot safely be completed automatically.

If repository policy permits, create a reviewed local Phase 4 checkpoint. Otherwise preserve the working tree and report that limitation.

Do not push to GitHub without permission.

---

# STEP 25 — NOTIFICATION ARCHITECTURE AND PERSISTENT OUTBOX

## 25.1 Objective

Build a reliable notification system that integrates with the existing task/workflow engine.

Whenever an eligible business event occurs, the application should:

1. Record the business change.
2. Record the notification intent durably.
3. Determine the correct recipient.
4. Determine consent and channel eligibility.
5. Process the notification asynchronously.
6. Track attempts and outcomes.
7. Prevent duplicate processing.
8. Display relevant information in the application.

**Task actions must never depend on Meta WhatsApp API availability.**

## 25.2 Required Notification Events

Support:

- task.assigned
- task.ready
- task.reassigned
- task.revision_requested
- task.due_soon
- task.overdue
- task.overdue_manager_escalation

Prepare extensible event contracts for future:

- meeting.assigned
- meeting.rescheduled
- meeting.reminder

Do not implement Meetings in Phase 5.

Use existing workflow events wherever possible.

Do not create two contradictory sources of truth for task readiness.

## 25.3 Notification Matrix

Implement:

EVENT: New actionable task assigned.

RECIPIENT: Assigned employee.

TIMING: Immediately after the authorized transaction commits.

EVENT: Previously blocked task becomes actionable.

RECIPIENT: Assigned employee.

TIMING: Immediately after task becomes ready.

EVENT: Task reassigned.

RECIPIENT: New assigned employee.

TIMING: Immediately after successful reassignment.

EVENT: Revision requested.

RECIPIENT: Task's assigned employee.

TIMING: Immediately after Manager requests revision.

EVENT: Task due in 24 hours.

RECIPIENT: Assigned employee.

TIMING: 24 hours before due time, only if task remains actionable and incomplete.

EVENT: Task overdue.

RECIPIENT: Assigned employee.

TIMING: Once when overdue.

EVENT: Task overdue more than 24 hours.

RECIPIENT: Authorized client/project Manager.

TIMING: Once after the configured 24-hour escalation threshold.

Do not repeatedly send overdue notifications for the same unchanged deadline.

Do not send ready-to-start notifications for work that remains Blocked.

Do not send assignment notifications to unrelated client team members.

Do not send duplicate task.ready and task.assigned messages for the same actionable transition unless explicitly configured.

## 25.4 Database Collections

Implement application-domain models:

notificationOutbox

notificationLogs

notificationInbox or an equivalent minimal persistent in-app notification model.

Add a notification preferences/configuration model only where necessary.

Reuse existing user WhatsApp consent fields.

Suggested outbox fields:

- id
- eventKey
- eventType
- sourceEntityType
- sourceEntityId
- recipientUserId
- channel
- templateKey
- templateParameters
- scheduledAt
- status
- attemptCount
- nextAttemptAt
- providerMessageId
- lastErrorCode
- lastErrorAt
- createdAt
- updatedAt

Suggested statuses:

- pending
- processing
- sent
- delivered
- read
- retry_scheduled
- failed
- suppressed
- cancelled

Use clearly defined allowed transitions.

Avoid conflating provider acceptance with delivery confirmation.

Add indexes for:

- Unique notification event identity.
- Pending/scheduled work.
- Recipient history.
- Entity/event lookups.
- Provider message ID where applicable.
- Failed-message management.

## 25.5 Transactional Outbox

For task events:

- Commit the task/workflow update and notification intent consistently.
- Use short MongoDB transactions where appropriate.
- Do not call Meta's external API inside the business transaction.
- Let the worker dispatch committed notification records.

Integrate with Phase 3 workflow events.

Do not generate duplicate notification intents when the same event is retried.

## 25.6 Idempotency

Implement unique logical notification keys.

Consider:

- Event type.
- Task ID.
- Task transition/version.
- Recipient ID.
- Deadline version when relevant.

Ensure one logical notification per eligible business event and recipient.

Do not assume WhatsApp provides exactly-once delivery.

Provider timeouts can be ambiguous. Implement safe retry and reconciliation policies rather than blindly resending possibly accepted messages.

## 25.7 In-App Fallback

Users should still see important task notifications when:

- WhatsApp consent is missing.
- WhatsApp number is invalid.
- Template is unavailable.
- Provider delivery fails.
- WhatsApp is disabled.

Create a minimal in-app notification mechanism with:

- Recipient.
- Event.
- Related task/project.
- Timestamp.
- Read/unread state.
- Deep link.

Do not build internal team chat.

## 25.8 Step 25 Tests

Test:

- Durable outbox write.
- Transactional consistency.
- Unique event keys.
- Duplicate prevention.
- Correct recipient.
- Client isolation.
- In-app fallback.
- No notification intent on rolled-back task updates.
- No duplicate task.ready events.
- Missing consent handling.
- Concurrent creation.
- Safe status transitions.

Fix all failures before Step 26.

---

# STEP 26 — META WHATSAPP CLOUD API INTEGRATION

## 26.1 Objective

Integrate the existing notification system with the official Meta WhatsApp Business Platform Cloud API.

Use currently supported Meta Graph API endpoints and authentication.

Verify the current API version and template payload format against official documentation during implementation.

Do not invent API fields.

## 26.2 Environment Configuration

Use server-side environment variables such as:

WHATSAPP_ACCESS_TOKEN

WHATSAPP_PHONE_NUMBER_ID

WHATSAPP_BUSINESS_ACCOUNT_ID

WHATSAPP_APP_SECRET

WHATSAPP_VERIFY_TOKEN

WHATSAPP_GRAPH_API_VERSION

WHATSAPP_NOTIFICATIONS_ENABLED

WHATSAPP_WEBHOOK_PUBLIC_URL

Use only verified required variables.

Never expose these values in the browser.

Do not log access tokens, verification tokens, webhook signatures or personal message content unnecessarily.

Create safe placeholders in .env.example.

Support separate development/test/production configurations.

## 26.3 Outbound WhatsApp Messages

Use official approved message templates for proactive employee notifications.

Support:

- Template name.
- Language code.
- Approved parameter definitions.
- Recipient E.164 number.
- Meta API request/response handling.
- Provider message ID.
- Error classification.

Do not send arbitrary freeform proactive messages outside Meta's permitted messaging rules.

Do not hardcode WhatsApp pricing.

Do not assume utility template classifications or charges; use the actual Meta-approved templates.

## 26.4 Notification Template Registry

Implement a configurable registry for:

- Task assignment.
- Task ready.
- Task reassignment.
- Revision requested.
- Due-soon reminder.
- Overdue notification.
- Manager escalation.

Example parameters:

employee_name

client_name

project_name

task_title

due_at_local

priority

task_url

Ensure parameter order and types match the actual approved Meta template definition.

Validate missing parameters.

Never insert passwords, API credentials or sensitive private task details into message templates.

## 26.5 Example Task Assignment Notification

Illustrative content only; actual sending requires an approved Meta template:

"Hi {{employee_name}}, a task has been assigned to you.

Client: {{client_name}}

Project: {{project_name}}

Task: {{task_title}}

Deadline: {{due_at_local}}

Open Task: {{task_url}}"

Do not assume this wording is automatically approved by Meta.

## 26.6 Example Ready-to-Start Notification

"Hi {{employee_name}}, your task is now ready to start.

Client: {{client_name}}

Task: {{task_title}}

All required prerequisites are complete.

Deadline: {{due_at_local}}

Open Task: {{task_url}}"

Use only an approved corresponding template in actual API calls.

## 26.7 Example Revision Notification

"Hi {{employee_name}}, revisions have been requested for your task.

Client: {{client_name}}

Task: {{task_title}}

Please open the task to review the feedback."

Avoid exposing sensitive internal revision comments in WhatsApp if unnecessary.

## 26.8 Webhook Verification

Implement Meta webhook verification.

Support the documented GET verification challenge and token validation.

Verify incoming POST webhook signatures using the configured Meta App Secret and raw request body.

Use appropriate constant-time signature comparison.

Reject invalid signatures.

Do not trust arbitrary inbound requests.

## 26.9 Delivery Webhooks

Process supported provider statuses:

- sent
- delivered
- read
- failed

Store:

- Provider message ID.
- Status.
- Provider timestamp.
- Error category/code where available.
- Processed timestamp.

Webhook handling must be idempotent.

Avoid duplicate status history when Meta retries a webhook.

Handle out-of-order provider events safely.

Do not regress a newer confirmed status because an older webhook arrived later.

## 26.10 Consent and Opt-Out

Before sending WhatsApp messages:

- Employee must have a valid WhatsApp number.
- Employee must have recorded opt-in consent.
- Consent timestamp must exist.
- Consent source must be recorded.
- Employee must not have opted out.
- Account must be active.

Provide an opt-out mechanism.

Ensure opt-out is enforced before actual dispatch, not only when the event is initially created.

Employee consent must not be inferred merely from possessing their phone number.

Keep important in-app notifications available when WhatsApp is unavailable.

## 26.11 Safe Sending Policy

Default development behavior:

WHATSAPP_NOTIFICATIONS_ENABLED=false

Use a mock provider for automated tests.

Do not send real WhatsApp messages to employees during tests.

For real-provider validation, use explicitly approved test recipients and valid approved templates only.

Do not activate production-wide outbound sending automatically.

Require explicit authorized configuration before enabling real delivery.

If live Meta credentials or approved templates are unavailable, finish and verify all locally testable components; identify real delivery as blocked/unverified.

Never claim real delivery passed based solely on mocked HTTP requests.

## 26.12 Step 26 Tests

Test:

- Request formatting.
- Template parameters.
- Phone validation.
- Invalid credentials.
- Rate limits.
- Provider errors.
- Timeout behavior.
- Webhook challenge.
- Invalid webhook signature.
- Valid signed status payload.
- Duplicate webhook.
- Out-of-order statuses.
- Opt-out suppression.
- Mock provider sending.
- No secret leakage.

Fix failures before Step 27.

---

# STEP 27 — AUTOMATED TASK AND WORKFLOW NOTIFICATIONS

## 27.1 Objective

Connect the notification engine to real Phase 2–4 workflows.

Employees should receive the correct notification as soon as work becomes actionable.

## 27.2 Task Assignment

When authorized Admin/Manager assigns a task:

- Verify task is actionable.
- Identify assigned employee.
- Write notification intent.
- Deliver via approved enabled channel.
- Record outcome.

For a Blocked task:

- Do not send a misleading ready-to-start message.
- Preserve assignment information.
- Send the task-ready notification when it actually becomes actionable.

## 27.3 Automatic Dependency Unlocking

Reuse Phase 3 task.ready events.

Example:

Video Ad Script becomes Done after approval.

Video Editing dependencies are now satisfied.

Video Editor's task becomes To Do.

The notification system must:

1. Identify the correct Video Editor.
2. Confirm task readiness.
3. Confirm current assignment eligibility.
4. Create the notification intent.
5. Dispatch when enabled and eligible.
6. Store delivery outcome.

Do not emit multiple messages because the same transition is evaluated repeatedly.

## 27.4 Multiple Simultaneous Tasks

One Campaign Brief might unlock:

- Scriptwriting.
- Meta Ad Copywriting.
- Campaign Tracking.

Each newly actionable task may generate the appropriate notification to its assigned employee.

Use one notification per eligible task/recipient/event rather than broadcasting to all team members.

## 27.5 Reassignment

When task assignment changes:

- Notify the new eligible assignee.
- Avoid notifying the previous employee as though they still own the task.
- Invalidate obsolete pending notifications.
- Preserve assignment activity.

If a ready-to-start message is already pending for the old employee, suppress it before dispatch.

## 27.6 Revision Requests

When Manager requests revision:

- Task returns to In Progress.
- Correct employee receives a revision notification.
- Preserve revision reason in the application.
- Do not leak unnecessary private notes into WhatsApp.

## 27.7 Unassigned Tasks

If task status shows Needs Assignment:

- Do not send employee assignment/ready messages.
- Surface the issue to authorized Managers inside the application.
- Resume eligible notification behavior after a valid assignment.

Do not randomly choose an employee.

## 27.8 Completed and Cancelled Tasks

Do not send stale assignment or deadline reminders after:

- Task is Done.
- Task is Cancelled.
- Employee assignment is removed.
- Notification is invalidated.
- Deadline changes.
- Consent is withdrawn.

Revalidate eligibility at dispatch time.

## 27.9 Historical Event Safety

Existing Phases 1–4 may have stored historical workflow events.

Do NOT send a backlog of old task notifications when Phase 5 is enabled.

Introduce a controlled activation boundary or equivalent safe cutover strategy.

Only newly eligible notification events should be sent after activation, unless an authorized administrator explicitly requests a safe backfill.

Do not automatically replay months of historical events.

## 27.10 Step 27 Tests

Test:

- Manual task assignment.
- Automatic assignment.
- Script approval unlock.
- Multiple ready tasks.
- Task reassignment.
- Revision request.
- Blocked task suppression.
- Missing assignee.
- Invalid assignee.
- Inactive employee.
- Opted-out employee.
- Duplicate transition.
- Cancelled pending event.
- Stale event suppression.
- Cross-client notification isolation.

Fix failures before Step 28.

---

# STEP 28 — AGENDA V6 WORKER, REMINDERS AND ESCALATIONS

## 28.1 Objective

Turn the existing worker scaffold into a reliable, persistent notification scheduler.

Use:

- Agenda v6.
- @agendajs/mongo-backend.
- Existing MongoDB.
- Separate Node.js worker process.

Do not use Redis.

Do not rely on frontend browser timers or a running user session.

## 28.2 Worker Responsibilities

Worker must handle:

- Pending outbound notifications.
- Retryable failed sends.
- Due-soon reminders.
- Overdue reminders.
- Manager escalations.
- Expired/stale notification suppression.
- Recovery after process restart.
- Scheduled weekly campaign review task creation, if fully supported and safely configured.

Prepare extension points for future meeting reminders.

## 28.3 Task Due-Soon Reminder

Default rule:

**24 hours before task due date.**

Recipient:

Assigned employee.

Conditions:

- Task exists.
- Task remains incomplete.
- Task is actionable.
- Task has valid assigned employee.
- Employee is active.
- Notification has not already been sent for the same deadline version.
- WhatsApp eligibility holds at dispatch.

If the deadline is closer than 24 hours when first configured, do not pretend the 24-hour reminder was sent on time; use a documented configurable policy for late-created reminders.

Do not send a due-soon reminder after the due time.

## 28.4 Task Overdue Reminder

Default rule:

Once when task becomes overdue.

Recipient:

Assigned employee.

Requirements:

- Do not change task status to Overdue.
- Keep Overdue as a derived property.
- Send only once for the relevant deadline version.
- Suppress if Done or Cancelled.
- Respect manual/dependency Blocked state.
- Avoid duplicate messages after worker restart.

## 28.5 Manager Escalation

Default rule:

If work remains overdue more than 24 hours, notify the appropriate authorized Manager once.

Resolve Manager using approved client/project ownership and access-level rules.

Do not send escalation to a random employee.

If no eligible Manager exists:

- Record unresolved escalation.
- Show the issue to Admin in-app.
- Do not silently redirect the alert to an unrelated person.

Escalation content should include relevant task/client/project context without sensitive information.

## 28.6 Deadline Changes

When due date changes:

1. Invalidate pending old reminders.
2. Recalculate due-soon time.
3. Recalculate overdue time.
4. Recalculate Manager escalation.
5. Persist new schedule safely.
6. Avoid old reminder delivery.
7. Avoid duplicate reminders for the new deadline version.

## 28.7 Task State Changes

On Done or Cancelled:

- Cancel/suppress outstanding reminders.

On Reopen:

- Reevaluate reminder eligibility.

On Reassignment:

- Invalidate old-recipient reminder intents.
- Generate correct new-recipient scheduling.

On Blocked:

- Suppress misleading actionable-work reminders.

On Unblocked:

- Restore eligible scheduling using the current deadline, without replaying stale reminders.

## 28.8 Worker Reliability

Implement:

- Persistent Agenda jobs.
- Safe job locking.
- Concurrency limits.
- Idempotent handlers.
- Retry with bounded exponential backoff.
- Maximum attempt policy.
- Failure logging.
- Stale-job recovery.
- Graceful shutdown.
- Process restart recovery.
- Health/operational visibility.

Only one logical event should be processed at a time where duplicate execution would cause duplicate messages.

Use MongoDB-backed state rather than in-memory-only delivery tracking.

## 28.9 Retry Strategy

Differentiate:

- Temporary provider failure.
- Permanent provider rejection.
- Invalid template.
- Invalid phone.
- Consent-related suppression.
- Rate limiting.
- Network timeout with uncertain provider acceptance.

Do not retry permanent failures indefinitely.

Do not create unlimited retry loops.

Preserve error codes without leaking tokens or unnecessary private data.

## 28.10 Weekly Campaign Review Recurrence

Phase 4 created a Weekly Campaign Review template node but did not implement recurrence.

Implement controlled recurrence for this existing campaign workflow.

Required behavior:

- Activate only when campaign/project becomes Live/Ongoing.
- Respect configuration associated with the generated project/template.
- Generate real weekly review tasks when scheduled.
- Assign the designated Performance Marketer or valid explicit override.
- Preserve completed review history.
- Avoid duplicate tasks for the same review period.
- Avoid generating reviews while campaign is On Hold, Completed or Cancelled.
- Resume appropriately when a campaign returns to Live.
- Preserve project/client authorization.
- Do not create unlimited past-due review tasks after a long outage.

Do not invent a company-specific weekday or clock time.

If cadence is specified only as weekly, use a clearly documented interval rule tied to the Live activation timestamp, or require an explicitly configured schedule.

Support timezone-aware scheduling.

Separate recurring task creation from WhatsApp notification delivery.

A review task may be created and visible in-app even when WhatsApp sending is disabled.

If the existing Phase 4 schema requires an additional explicit schedule field, implement it compatibly.

Do not build a generic complex recurring-workflow editor.

## 28.11 Future Meeting Support

Phase 6 will require:

- Meeting assigned/rescheduled notifications.
- One-hour meeting reminders.
- Cancellation of old reminders after rescheduling.

Prepare generic Agenda scheduling/cancellation functions where sensible.

Do not build Meetings now.

## 28.12 Step 28 Tests

Test:

- Worker starts.
- Worker stops gracefully.
- Persistent job execution.
- Worker restart recovery.
- Multiple workers/concurrency.
- Due reminder 24 hours before.
- No reminder after completion.
- Deadline rescheduling.
- Overdue once.
- Manager escalation after 24 hours.
- No duplicate escalation.
- Invalid recipient suppression.
- Opt-out at dispatch.
- Retry/backoff.
- Permanent failure.
- Provider timeout.
- Weekly review activates on Live.
- Weekly review suppressed on Hold/Completed.
- Weekly review deduplication.
- Restart does not create old repeated reviews.
- No historical notification flood.

Fix failures before Step 29.

---

# STEP 29 — NOTIFICATION SETTINGS, CONSENT, LOGS AND FRONTEND

## 29.1 Objective

Provide practical visibility and controls for Admin, authorized Managers and Employees.

Use existing application design.

Do not build a separate messaging CRM.

## 29.2 Admin Notification Settings

Create Settings → Notifications.

Show:

- WhatsApp integration configured/not configured.
- WhatsApp outbound enabled/disabled.
- Configured template mappings.
- Worker health/status.
- Notification failures.
- Recent notification counts.
- Reminder settings.
- Escalation settings.

Do not show actual access tokens or App Secrets.

Use safe status indicators.

## 29.3 Template Mapping UI

Admin can manage configured mappings between:

- Internal notification event.
- Meta-approved template name.
- Language.
- Required parameter definitions.

Validate configuration before activation.

Show missing/unapproved template configuration clearly.

Do not claim Meta approved a template solely because its name exists locally.

## 29.4 Employee WhatsApp Profile

Extend existing Profile/Team screens where appropriate.

Employee should see:

- Registered WhatsApp phone number.
- Notification consent status.
- Opt-in/opt-out control.
- Relevant notification preferences, where supported.

Record:

- Consent source.
- Consent timestamp.
- Withdrawal timestamp.

Admin can view operational consent status but cannot silently fabricate employee consent.

Use appropriate authorization.

## 29.5 Notification Center

Create a small in-app notification center.

Show:

- Notification title.
- Client/project/task context where authorized.
- Event type.
- Timestamp.
- Read/unread.
- Link to relevant task.

Support:

- Mark as read.
- Open related task.
- Basic filters if useful.

Prevent access to another employee's notifications.

## 29.6 Notification Logs

Admin can view:

- Event type.
- Recipient.
- Channel.
- Scheduling time.
- Processing status.
- Provider acceptance.
- Delivery/read status when available.
- Attempt count.
- Sanitized failure reason.

Managers may view relevant client/project notification information only when explicitly authorized.

Employees may see only their own notification history, not private provider logs or other employees' messages.

## 29.7 Failed Message Handling

Provide Admin visibility for:

- Failed notifications.
- Missing approved templates.
- Invalid recipients.
- Missing consent.
- Worker failures.
- Provider errors.

If manual retry is implemented:

- Require Admin authorization.
- Recheck current consent and task state.
- Prevent duplicate sends.
- Record the retry action.
- Respect permanent-failure rules.

## 29.8 UI Design

Use existing:

- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Radix.
- Lucide.
- TanStack Query.
- TanStack Table.
- React Hook Form.
- Zod.
- Sonner.

Keep the UI:

- Premium.
- Minimal.
- Responsive.
- Easy to understand.
- Accessible.

All controls must use real APIs.

Do not use mock notification counts in production.

## 29.9 Frontend Pages

Implement or extend:

- Notification Center.
- Settings → Notifications.
- Employee Profile consent controls.
- Admin notification logs.
- Failed delivery view.
- Worker/integration status display.

Do not create unrelated screens.

## 29.10 Step 29 Tests

Test:

- Admin settings access.
- Employee consent management.
- Opt-out.
- Notification center.
- Read/unread.
- Recipient isolation.
- Manager scope.
- Failed message visibility.
- No token exposure.
- Mobile notification screens.
- Template mapping validation.
- Real API integration.

Fix failures before Step 30.

---

# STEP 30 — FULL VERIFICATION, SECURITY AUDIT AND REGRESSION

## 30.1 Objective

Verify all Phase 5 features end to end.

Preserve the completed Phase 1–4 systems.

Do not declare completion based only on mock UI demonstrations.

## 30.2 Main Business Workflow

Use isolated test data:

Client:

Travel Enfield.

Project:

Singapore Meta Ads Campaign.

Employees:

- Video Ad Script Writer.
- Video Editor.
- Performance Marketer.
- Project Manager.

Workflow:

1. Campaign Brief is assigned.
2. Eligible employee notification intent is recorded.
3. Campaign Brief is completed.
4. Scriptwriting becomes actionable.
5. Script Writer receives task-ready notification.
6. Script Writer submits work for approval.
7. Manager approves Script.
8. Editing becomes actionable.
9. Correct Video Editor receives task-ready notification.
10. Video Editor submits video for approval.
11. Manager requests revision.
12. Editor receives revision notification.
13. Editor resubmits.
14. Manager approves.
15. Campaign Launch remains blocked until all other prerequisites complete.
16. Launch becomes actionable.
17. Correct Performance Marketer receives notification.
18. Reminders reflect current deadlines and status.

Verify no duplicate events.

For automated tests, use a deterministic mock Meta provider.

Live-provider acceptance/delivery must be separately validated with approved test recipients and credentials when available.

## 30.3 Deadline Scenario

Create a task due in 48 hours.

Expected:

- Due-soon job scheduled correctly.
- 24-hour reminder becomes eligible at the configured time.
- Task completion suppresses stale reminders.
- Due-date modification reschedules reminders.
- Overdue task produces one overdue event.
- Manager escalation occurs after 24 hours overdue.
- Worker restart does not duplicate events.

Use controllable test clocks rather than waiting real days.

## 30.4 Consent Scenario

Employee has no WhatsApp consent.

Expected:

- No WhatsApp message is sent.
- In-app notification is retained.
- Consent issue is visible where appropriate.

Employee opts in.

Expected:

- Newly eligible events may be sent.
- Historical suppressed messages are not automatically replayed.

Employee opts out.

Expected:

- Pending WhatsApp sends are suppressed.
- Future WhatsApp sends are prohibited until new valid consent.

## 30.5 Security Audit

Verify:

1. WhatsApp tokens server-side only.
2. Public webhook signatures verified.
3. No forged delivery events accepted.
4. No secret leakage in logs.
5. No cross-client notification access.
6. No unauthorized notification settings changes.
7. No unauthorized manual retries.
8. No invented employee consent.
9. No WhatsApp sending after opt-out.
10. No stale notifications to reassigned employees.
11. No provider calls during MongoDB transactions.
12. No duplicate notification intent on repeated workflow evaluation.
13. No unbounded retry loops.
14. No sensitive credentials in template parameters.
15. No unauthorized Manager escalation data.
16. No accidental mass historical sending.
17. No task changes rolled back due to WhatsApp failure.
18. No unsecured worker administration routes.
19. Safe environment configuration.
20. Secure production webhook URL requirements.

## 30.6 MongoDB Integration Tests

Run isolated replica-set integration tests for:

- Notification outbox.
- Notification logs.
- Unique keys.
- Task event integration.
- Worker scheduling.
- Reminder cancellation.
- Rescheduling.
- Escalations.
- Recurrence.
- Consent enforcement.
- Retries.
- Stale event handling.
- Concurrent workers.
- Delivery webhook status updates.
- Data isolation.

Do not skip transaction-dependent tests.

## 30.7 Playwright E2E

Create and execute browser tests including:

1. Admin login.
2. Notification settings.
3. Template mappings.
4. Employee WhatsApp consent.
5. Task assignment.
6. Task ready after dependency completion.
7. Correct Video Editor recipient.
8. Revision notification.
9. Missing assignment.
10. Blocked task suppression.
11. In-app notification list.
12. Read/unread.
13. Failed delivery visibility.
14. Worker status.
15. Due reminder scheduling.
16. Overdue event.
17. Manager escalation.
18. Deadline rescheduling.
19. Task completion suppression.
20. Consent opt-out.
21. No unauthorized Manager settings access.
22. Employee notification isolation.
23. Mobile notification center.
24. Mobile settings.
25. Weekly campaign review after Live status.
26. No recurring review after Completed status.
27. Existing approval workflow.
28. Existing Phase 3 dependency workflow.
29. Existing Phase 4 project template creation.
30. Authentication regression.

Use the existing Playwright E2E infrastructure.

Do not make actual WhatsApp sends to real employees during E2E tests.

## 30.8 Phase 1–4 Regression

Retest:

- Authentication.
- Employee management.
- Client management.
- Functional roles.
- Permissions.
- Projects.
- Tasks/subtasks.
- Approvals.
- Dependencies.
- Automatic assignment.
- Downstream review.
- Campaign template generation.
- Onboarding template generation.
- Atomic project generation.
- Template versioning.
- My Tasks.
- Dashboard.
- Existing mobile workflows.

## 30.9 Quality Gates

Run:

pnpm format:check

pnpm lint

pnpm typecheck

pnpm build

pnpm test

Relevant Playwright E2E commands.

Run MongoDB tests against isolated replica-set-compatible infrastructure.

Report exact:

- Passed.
- Failed.
- Skipped.
- Not executed.

Do not count tests that were written but never executed.

Document which WhatsApp tests used mocks and which used real Meta Cloud API.

Do not claim production messaging is live unless explicitly enabled and verified.

## 30.10 Documentation

Update:

- README.md
- AGENTS.md
- docs/01-technology-stack.md
- docs/03-authorization.md
- docs/04-data-model.md
- docs/05-api.md
- docs/06-frontend.md
- docs/07-development-phases.md
- docs/08-testing-strategy.md
- docs/09-deployment.md
- docs/decisions.md
- docs/traceability.md

Preserve the original requirements text in docs/00-product-requirements.md.

Document:

- WhatsApp integration setup.
- Meta prerequisites.
- Approved template setup.
- Consent process.
- Outbox architecture.
- Worker scheduling.
- Retry strategy.
- Webhook security.
- Notification matrix.
- In-app fallback.
- Deadline changes.
- Escalations.
- Weekly review recurrence.
- Local development.
- Environment variables.
- Test procedures.
- Mock vs real-provider verification.
- Production activation checklist.

---

# 4. PHASE BOUNDARIES

## Phase 5 Includes

- WhatsApp Cloud API integration.
- Approved outbound templates.
- Consent/opt-out.
- Persistent notification outbox.
- Delivery logs.
- Provider webhooks.
- Task assignment notifications.
- Task-ready notifications.
- Reassignment notifications.
- Revision notifications.
- Due reminders.
- Overdue alerts.
- Manager escalation.
- Agenda worker.
- In-app notifications.
- Notification settings.
- Weekly campaign review recurrence.
- Testing and documentation.

## Phase 6 Does NOT Start

Do not implement:

- Client Meeting database.
- Meeting Calendar.
- Meeting Agenda.
- Meeting Notes.
- Meeting Decisions.
- Meeting Action Items.
- Meeting-to-task conversion.
- One-hour meeting reminders.

Prepare compatible scheduling functions, but leave meeting features for Phase 6.

## Phase 7 Does NOT Start

Do not implement:

- Full AWS EC2 deployment.
- Nginx production configuration overhaul.
- Production infrastructure provisioning.
- Final load-testing program.
- Final operations deployment.

You may document worker production requirements.

Do not deploy without permission.

---

# 5. STRICT ENGINEERING RULES

1. Preserve Phases 1–4.
2. Use official Meta WhatsApp Cloud API only.
3. Never send without valid consent.
4. Never expose credentials.
5. Never log plaintext authentication tokens.
6. Never send old historical notifications by default.
7. Never call Meta inside task transactions.
8. Never roll back task completion due to provider failure.
9. Never randomly choose notification recipients.
10. Never notify unrelated employees.
11. Never count Blocked work as ready.
12. Never send stale reminders for completed work.
13. Never ignore deadline changes.
14. Never repeatedly escalate the same unchanged overdue task.
15. Never claim provider acceptance means actual delivery.
16. Never claim exactly-once external delivery without provider guarantees.
17. Use persisted retry/idempotency data.
18. Protect webhook endpoints.
19. Keep the existing six task statuses.
20. Preserve client/project security boundaries.
21. Use existing workflow events where possible.
22. Keep the worker separate from API/web.
23. Use existing Agenda v6 and MongoDB.
24. Do not introduce Redis.
25. Use real APIs in frontend.
26. Use deterministic tests.
27. Fix errors before continuing.
28. Do not add unrelated features.
29. Do not start Phase 6 or 7.
30. Stop after Step 30.

---

# 6. REQUIRED EXECUTION ORDER

STEP 25:
Notification contracts, outbox, logs, inbox, transactional event capture, tests.

STEP 26:
Meta Cloud API client, approved template mapping, consent, signed webhooks, delivery status processing, tests.

STEP 27:
Connect task assignment/readiness/reassignment/revision events, suppression, recipient resolution, tests.

STEP 28:
Agenda worker, 24-hour reminders, overdue once, 24-hour Manager escalation, worker recovery, weekly review recurrence, tests.

STEP 29:
Notification Center, Settings, consent UI, delivery logs, failed messages, responsive screens, tests.

STEP 30:
Security audit, MongoDB integration, Playwright E2E, regression, documentation, final report.

Continue automatically after each successful step.

Stop only for genuine blockers.

---

# 7. FINAL ACCEPTANCE CRITERIA

Phase 5 is complete only when:

- Notification events are persisted durably.
- Notification duplicates are prevented within the application.
- Official Meta Cloud API integration is implemented.
- Approved template configuration works.
- WhatsApp opt-in is enforced.
- WhatsApp opt-out is enforced.
- Signed webhook validation works.
- Delivery events are processed safely.
- Correct employees are notified for eligible events.
- Script approval produces the correct Video Editor notification intent.
- Assignment/reassignment notifications work.
- Revision notifications work.
- Due reminders are scheduled correctly.
- Overdue reminders fire only once per applicable deadline version.
- Manager escalations follow the approved delay and authorization rules.
- Deadline changes invalidate old reminders.
- Completed/Cancelled tasks suppress stale reminders.
- Blocked tasks do not generate misleading ready notifications.
- Missing assignments do not send messages to arbitrary employees.
- Worker restarts recover pending work.
- Retries are bounded and auditable.
- In-app notifications work as fallback.
- Employee notification privacy is preserved.
- Admin can inspect notification failures.
- Weekly campaign reviews recur correctly after Live activation.
- No historical notification flood occurs on activation.
- No real employee WhatsApp sends occur during tests.
- Full Phase 1–4 regressions pass.
- MongoDB integration tests pass.
- Playwright E2E tests pass.
- Typecheck passes.
- Lint passes.
- Build passes.
- Formatting passes.
- Documentation is updated.
- No prohibited technologies introduced.

If actual Meta credentials or approved templates are unavailable, report **live-provider verification as blocked**, not as passed. Do not claim production WhatsApp readiness until the external setup is complete.

---

# 8. REQUIRED PHASE 5 COMPLETION REPORT

After all steps, provide a consolidated report covering:

1. Overall Phase 5 status.
2. Steps 25–30 summary.
3. Files created and modified.
4. Database models/indexes.
5. Event/outbox architecture.
6. Notification idempotency.
7. Official Meta integration.
8. Approved template mappings.
9. Consent and opt-out enforcement.
10. Webhook verification/security.
11. Delivery tracking.
12. Task/workflow event integration.
13. Deadline reminder scheduling.
14. Overdue and Manager escalation.
15. Agenda worker reliability.
16. Weekly campaign review recurrence.
17. In-app fallback.
18. Admin settings/logs.
19. Frontend screens.
20. REST API endpoints.
21. Security audit findings.
22. Unit/integration test results.
23. Playwright E2E results.
24. Phase 1–4 regression results.
25. Live-provider tests executed or blocked.
26. Bugs found/fixed.
27. Technical limitations.
28. Documentation changes.
29. Git state.
30. Readiness for Phase 6.

Always distinguish:

- Implemented and tested locally.
- Tested with mocked Meta provider.
- Verified using real Meta Cloud API.
- Blocked pending credentials/template approval.
- Deferred to Phase 6/7.

Report exact test counts.

Do not invent success.

---

# 9. FINAL STOP INSTRUCTION

After Step 30:

STOP DEVELOPMENT.

Do not implement Phase 6 Meetings.

Do not start Phase 7 deployment.

Do not automatically activate production WhatsApp messaging.

Provide the final Phase 5 completion report and wait for my approval.

The required outcome is a reliable automated notification system that connects Interscale Marketing's existing task workflows to official WhatsApp Business messaging, gives employees timely and relevant information, manages deadlines and escalations, preserves consent and privacy, and remains resilient when external messaging fails.