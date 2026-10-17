# INTERSCALE MARKETING — PHASE 6 COMPLETE IMPLEMENTATION
## Steps 31–36 | Client Meetings, Calendar, Meeting Notes, Decisions, Action Items, Follow-Up Tasks & WhatsApp Reminders

# 0. YOUR ROLE AND OBJECTIVE

Act as a Principal Software Architect, Senior Full-Stack TypeScript Engineer, MongoDB Database Architect, Workflow Automation Engineer, Security Engineer, UI/UX Engineer, and Quality Assurance Lead.

You are developing **Interscale Marketing's internal Project & Team Management System**.

Project directory:

C:\Users\User\Desktop\vikas\project-management

Git Bash equivalent:

/c/Users/User/Desktop/vikas/project-management

## CURRENT DEVELOPMENT STATUS

Phases 1–5 have been completed according to previous OpenCode implementation reports.

Current application functionality:

PHASE 1:
- Better Auth authentication.
- Secure Admin bootstrap.
- Employee accounts.
- Admin/Manager/Employee access levels.
- Multiple functional job roles.
- Client management.
- Client-specific employee assignments.
- Authorization and client isolation.

PHASE 2:
- Project management.
- Task management.
- Real subtasks.
- Task statuses.
- Approval and revision workflows.
- My Tasks.
- Approval queue.
- Dashboard.

PHASE 3:
- Task dependency engine.
- Automatic unlocking.
- Client-specific automatic assignment.
- Downstream dependency review.
- Workflow readiness events.

PHASE 4:
- Campaign templates.
- Client onboarding templates.
- Template versioning.
- Atomic project generation.
- Automatically generated tasks, subtasks, and dependencies.

PHASE 5:
- Persistent notification outbox.
- In-app notification center.
- Meta WhatsApp Cloud API integration.
- Approved template mapping infrastructure.
- WhatsApp consent management.
- Signed provider webhooks.
- Agenda v6 worker.
- Deadline reminders.
- Overdue notifications.
- Manager escalations.
- Weekly campaign review recurrence.

Previous Phase 5 report:

- 315 unit/integration tests passed.
- 78 Playwright E2E tests passed.
- Mocked Meta provider tests passed.
- Real Meta WhatsApp messaging is NOT configured or enabled.
- WhatsApp outbound is disabled by default.
- The existing worker handles notifications and recurrence.

These results are from earlier reports. Verify the repository before making changes.

## YOUR NEW ASSIGNMENT

Complete the entire Phase 6:

STEP 31 — Meeting Database Models, Authorization & REST APIs.

STEP 32 — Meeting Scheduling, Rescheduling, Client/Project Association & Calendar Infrastructure.

STEP 33 — Meeting Notes, Decisions, Action Items & Conversion to Project Tasks.

STEP 34 — Meeting Notifications, One-Hour Reminders & Existing Agenda Worker Integration.

STEP 35 — Complete Meeting Management Frontend, Calendar, Project Manager Daily Schedule & Dashboard Integration.

STEP 36 — Security Audit, Integration Testing, Playwright E2E, Regression Testing & Documentation.

Complete all six steps sequentially in ONE continuous development run.

After every step:

1. Implement the required functionality.
2. Run relevant automated tests.
3. Fix failures.
4. Verify access restrictions.
5. Update required documentation.
6. Continue automatically to the next step.

Do not request approval between Steps 31–36 unless a critical external blocker, missing credential, or material security-sensitive decision requires user input.

Do not implement unrelated Phase 7 functionality.

**STOP after Step 36.**

The objective is a real, secure, fully integrated meeting management system — not a prototype or a frontend-only calendar.

---

# 1. READ THE EXISTING PROJECT REQUIREMENTS FIRST

Before modifying code, read:

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
- docs/09-deployment.md
- docs/decisions.md
- docs/traceability.md
- docs/phase5-completion-report.md, if present.
- Relevant Architecture Decision Records.

Also inspect:

- Existing MongoDB models and services.
- Client membership models.
- Functional job roles.
- Manager permissions.
- Project management services.
- Task/subtask services.
- Task assignment services.
- Audit history.
- Phase 5 notification outbox.
- Phase 5 notification template registry.
- Phase 5 in-app notification center.
- Agenda worker implementation.
- WhatsApp consent validation.
- Existing React routing/navigation.
- Existing dashboard.
- Existing Playwright E2E infrastructure.

Do not create duplicate implementations of existing functionality.

Use existing naming, API, validation, service, transaction, and authorization conventions.

## REQUIREMENTS PRECEDENCE

1. Approved final technology stack.
2. Approved authentication and access control decisions.
3. Existing finalized business decisions.
4. Original MVP v1.1 requirements.
5. This Phase 6 implementation specification.

Do not silently replace established business rules.

If a serious conflict exists, document the conflict and request clarification only when necessary.

Preserve all functionality from Phases 1–5.

---

# 2. BUSINESS CONTEXT

Interscale Marketing is a performance marketing agency specializing in B2C travel agencies.

We manage multiple travel agency clients.

Each client can have multiple destination-specific advertising projects.

Examples:

Client: Travel Enfield

Projects:
- Singapore Meta Ads Campaign.
- Kashmir Meta Ads Campaign.
- Vietnam Meta Ads Campaign.
- Client Onboarding & Technical Setup.

The Project Manager regularly conducts meetings with clients to:

- Discuss advertising performance.
- Review campaign results.
- Understand client concerns.
- Discuss lead quality.
- Review sales follow-ups.
- Discuss upcoming destination campaigns.
- Record decisions.
- Assign follow-up work.
- Track outstanding actions.

Currently, our software manages clients, campaigns, employees, tasks, and notifications.

**Phase 6 must connect client meetings to this existing workflow.**

## 2.1 Core Business Requirement

Every client meeting must have:

- A responsible Project Manager.
- Meeting date and time.
- Associated client.
- Optional associated project.
- Agenda.
- Meeting link or location.
- Status.
- Notes and discussions.
- Decisions.
- Follow-up action items.
- Related project tasks, where created.

The Project Manager should see their meetings alongside their existing work.

The system should send appropriate meeting notifications and a reminder one hour before the meeting.

After a meeting, the Project Manager should record what was discussed and convert follow-up actions into real assigned tasks.

## 2.2 Example

Client: Travel Enfield

Meeting:

Singapore Campaign Performance Review

Date:

User-selected date.

Time:

User-selected time.

Project Manager:

Authorized assigned employee.

Agenda:

- Review Singapore campaign performance.
- Discuss lead quality.
- Discuss client sales follow-up.
- Review upcoming creatives.
- Finalize next campaign actions.

After the meeting:

Decision 1:

Create new Singapore video advertisements.

Decision 2:

Improve follow-up handling for high-intent enquiries.

Action Item 1:

Create two new Singapore ad scripts.

Responsible role:

Video Ad Script Writer.

Action Item 2:

Update Meta campaign targeting and creatives.

Responsible role:

Performance Marketer.

Action Item 3:

Update WhatsApp qualification flow.

Responsible role:

Performance Marketer.

These action items should be convertible into actual tasks inside the selected Singapore project.

The responsible employees should see those tasks in My Tasks.

The existing Phase 5 notification system should handle eligible task-assignment messages.

---

# 3. APPROVED TECHNOLOGY STACK

Maintain the existing approved stack.

## Architecture

- TypeScript strict.
- pnpm workspaces.
- Modular monolith.
- Express 5 REST API.
- MongoDB.
- Mongoose.
- Shared Zod schemas.
- Separate Agenda v6 worker.

## Frontend

- React.
- TypeScript.
- Vite.
- React Router.
- Tailwind CSS.
- shadcn/ui.
- Radix UI.
- Lucide React.
- Sonner.
- TanStack Query.
- TanStack Table.
- React Hook Form.
- Zod.
- FullCalendar React.
- FullCalendar standard MIT-licensed plugins only.
- date-fns.
- date-fns-tz.

## Backend

- Node.js LTS.
- Express 5.
- Mongoose.
- Zod.
- Pino.
- pino-http.
- Helmet.
- express-rate-limit.
- OpenAPI/Swagger.

## Authentication

- Better Auth.
- @better-auth/mongo-adapter.
- Better Auth Admin plugin.
- Existing application authorization middleware.

## Notifications

- Existing Phase 5 notification outbox.
- Existing Agenda v6 worker.
- @agendajs/mongo-backend.
- Existing official Meta WhatsApp Cloud API integration.
- Existing in-app notification center.

## Testing

- Vitest.
- Supertest.
- Playwright.
- MongoDB replica-set integration tests.
- ESLint.
- Prettier.
- TypeScript strict.

## Deployment Architecture

- AWS EC2.
- Nginx.
- PM2.
- HTTPS/Certbot.

Do not introduce:

- Docker.
- Docker Compose.
- PostgreSQL.
- Prisma.
- Redis.
- Another authentication provider.
- Another notification provider.
- Unapproved SaaS integrations.
- Dedicated file hosting.
- Native Android/iOS applications.

Do not build Google Calendar or Microsoft Calendar integrations unless separately approved.

---

# 4. PRE-IMPLEMENTATION AUDIT AND GIT SAFETY

Before Step 31:

1. Inspect the current Git branch.
2. Inspect Git status.
3. Inspect existing commits.
4. Identify unrelated changes.
5. Check for tracked secrets.
6. Verify the existing application builds.
7. Run existing relevant tests.
8. Identify any failures or skipped critical tests.

Previous report raised a concern:

`quotation.pdf` approximately 38 MB was committed to the repository.

Verify whether this remains true.

If unrelated to the project:

- Preserve the local PDF.
- Stop it from being included in future commits.
- Propose safe removal from Git tracking.
- Do not destroy the user's local file.
- Do not rewrite Git history without explicit approval.

Also inspect previously documented issues:

- Task reason/note validation mismatch.
- Dependency indexes.
- Sensitive environment configuration.
- Rate limiting.
- Existing notification consent enforcement.

Fix confirmed blockers affecting Phase 6 safety, or explicitly report them if outside the authorized scope.

Do not expose credentials.

Do not push to GitHub without authorization.

If local commits require explicit permission under repository rules, preserve changes and report Git status rather than creating an unauthorized commit.

---

# STEP 31 — MEETING DATABASE, MODELS, AUTHORIZATION & REST APIs

## 31.1 Objective

Implement a dedicated Meeting module integrated with existing client, project, employee, authorization, and audit models.

**Meetings are independent records. They are not Tasks.**

A Meeting may generate Tasks through action items, but the Meeting itself must remain a separate entity.

## 31.2 Meeting Data Model

Create a Mongoose model/collection:

`meetings`

Suggested fields:

- _id
- clientId
- projectId (optional)
- title
- agenda
- startsAt
- endsAt
- timezone
- ownerUserId
- attendeeUserIds
- meetingUrl
- location
- status
- discussionNotes
- decisions
- createdBy
- updatedBy
- completedAt
- cancelledAt
- rescheduledAt
- createdAt
- updatedAt
- __v

Use existing ObjectId conventions.

Meeting URL and physical location are optional alternatives; don't require both.

Store timestamps in UTC.

Use timezone information for local display and scheduling.

Default timezone:

Asia/Kolkata.

Do not store plaintext passwords or access tokens in meeting records.

## 31.3 Meeting Statuses

Support the approved statuses:

1. Scheduled.
2. Completed.
3. Cancelled.
4. Rescheduled.

Implement a clearly documented lifecycle.

A reschedule must retain the same meeting identity and preserve history.

Distinguish a reschedule event from whether the meeting is currently scheduled and eligible for reminders. If the persisted status is Rescheduled, define its active scheduled semantics without adding an unauthorized fifth status.

Do not create duplicate meetings just because a date changes.

## 31.4 Date and Time Rules

Validation:

- Meeting title required.
- Client required.
- Responsible Manager required.
- Start date/time required.
- End date/time required.
- End must be later than start.
- Timezone must be valid.
- Meeting dates must be unambiguous.
- Appropriate validation for meetings scheduled in the past.

Handle:

- Different timezones.
- UTC storage.
- Asia/Kolkata default display.
- Local date/time input conversion.
- Daylight saving transitions for other supported timezones.

Do not assume every timezone always has UTC+05:30.

Use existing approved date-fns and date-fns-tz libraries.

## 31.5 Client and Project Association

Every Meeting must belong to exactly one Client.

Project association is optional.

If projectId exists:

- Project must exist.
- Project must belong to the same client.
- User must have permission to access the project.

Reject cross-client project references.

Do not allow a Meeting for Client A to reference Client B's project.

## 31.6 Meeting Owner

The meeting owner is usually the client's Project Manager.

Rules:

- Employee must exist.
- Account must be active.
- Owner must be eligible to coordinate the relevant client.
- Owner should hold the Project Manager functional role where required by the existing approved specification.
- Being meeting owner does not automatically grant application Manager access.
- Assignment must not increase the employee's permission level.

Use existing client-role mappings where appropriate.

A designated Project Manager may be suggested automatically.

Allow authorized override only with correct eligibility and permission checks.

Never randomly select an employee.

If there is no valid meeting owner:

- Show Needs Assignment or a clear setup warning.
- Do not schedule WhatsApp messages for an undefined recipient.
- Do not invent ownership.

## 31.7 Meeting Attendees

Support optional internal employees as attendees.

Rules:

- Only valid active users.
- No duplicate attendee entries.
- Client/project scope validated.
- Attendee status does not automatically grant full client/project access.
- Attendees may view only appropriate meeting information under the authorization policy.

External client attendees do not need employee accounts.

If storing external attendees is useful, use limited contact/display information only with an appropriate privacy policy.

Do not create a client login portal.

## 31.8 Meeting Authorization

Use existing application access levels.

### Admin

May:

- Create meetings.
- View all meetings.
- Edit meetings.
- Reschedule meetings.
- Cancel meetings.
- Complete meetings.
- Manage authorized meeting records.

### Manager

May:

- Create meetings for assigned clients.
- Manage meetings within authorized client/project scope.
- View meetings relevant to their assigned scope.
- Record meeting notes and decisions.
- Manage action items.
- Convert action items into tasks.

### Employee

May:

- View a meeting when explicitly assigned an appropriate meeting role or included as an authorized attendee.
- Manage meeting content only if specifically authorized for that meeting.
- Never automatically receive unrestricted client/project permissions by being an attendee.
- Never access unrelated meetings.

A Project Manager functional role alone must not bypass application access controls.

Do not create a fourth application access level.

## 31.9 Server-Side Security

Every API must enforce:

- Authenticated session.
- Active account.
- Password-change requirements.
- Client scope.
- Project scope.
- Meeting ownership/participation.
- Field-level permissions.
- Authorized action.

Out-of-scope resources should follow existing safe 404 behavior.

Do not expose confidential agendas, discussions, or decisions to unrelated employees.

## 31.10 Meeting REST APIs

Implement suitable endpoints:

GET /api/v1/meetings

POST /api/v1/meetings

GET /api/v1/meetings/:meetingId

PATCH /api/v1/meetings/:meetingId

POST /api/v1/meetings/:meetingId/reschedule

POST /api/v1/meetings/:meetingId/cancel

POST /api/v1/meetings/:meetingId/complete

GET /api/v1/clients/:clientId/meetings

GET /api/v1/projects/:projectId/meetings

GET /api/v1/me/meetings

Use existing API response conventions.

Support pagination, date filtering, client filtering, project filtering, owner filtering and status filtering where appropriate.

Do not create redundant endpoints unnecessarily.

## 31.11 Meeting Audit History

Audit:

- Meeting created.
- Owner changed.
- Attendees updated.
- Agenda updated.
- Meeting rescheduled.
- Meeting cancelled.
- Meeting completed.
- Notes updated.
- Decisions recorded.
- Action items created/updated.
- Action item converted into a task.

Include:

- Actor.
- Meeting ID.
- Action.
- Timestamp.
- Sanitized changes.

Do not log sensitive credentials.

## 31.12 MongoDB Indexes

Add appropriate indexes for:

- clientId and startsAt.
- projectId and startsAt.
- ownerUserId and startsAt.
- status and startsAt.
- relevant scheduled meeting lookups.
- audit history.

Do not add redundant indexes without analyzing query patterns.

Use optimistic concurrency and transactions where appropriate.

## 31.13 Step 31 Tests

Test:

1. Meeting creation.
2. Meeting update.
3. Meeting list/filter.
4. Valid client association.
5. Valid optional project association.
6. Cross-client project rejection.
7. Owner validation.
8. Invalid attendee rejection.
9. Duplicate attendee prevention.
10. Invalid date/time rejection.
11. Manager scope.
12. Employee meeting restrictions.
13. IDOR prevention.
14. Meeting status validation.
15. Optimistic concurrency.
16. Audit history.

Run all relevant checks before continuing.

---

# STEP 32 — MEETING SCHEDULING, RESCHEDULING & CALENDAR INFRASTRUCTURE

## 32.1 Objective

Implement a dependable scheduling workflow that allows authorized staff to schedule and reschedule client meetings.

## 32.2 Create Meeting Workflow

User flow:

1. Open Meetings.
2. Click Schedule Meeting.
3. Select client.
4. Optionally select project.
5. Enter meeting title.
6. Enter agenda.
7. Select meeting date.
8. Select start time.
9. Select end time.
10. Confirm timezone.
11. Select Project Manager.
12. Add internal attendees.
13. Add meeting URL/location.
14. Review details.
15. Save meeting.

Store the meeting in MongoDB.

Use real APIs.

No placeholder forms.

## 32.3 Meeting Date/Time Display

Show:

- Meeting date.
- Start time.
- End time.
- Timezone.
- Owner.
- Client.
- Optional project.
- Status.

Default UI timezone:

Asia/Kolkata.

Use correct timezone conversions.

Avoid accidental browser-local input drift.

## 32.4 Rescheduling

Authorized Manager/Admin can reschedule a meeting.

Example:

Original meeting:

Monday at 3 PM.

New meeting:

Tuesday at 4 PM.

Required behavior:

1. Retain original Meeting ID.
2. Update start/end times.
3. Preserve the original schedule in audit/history.
4. Increment schedule version or equivalent token.
5. Invalidate old reminder.
6. Schedule new reminder.
7. Create appropriate reschedule notification intent.
8. Prevent duplicate notifications.
9. Preserve agenda, notes, attendees, and action items.
10. Display updated schedule immediately.

Do not create a new meeting record for every reschedule.

## 32.5 Cancellation

When a meeting is cancelled:

- Change status to Cancelled.
- Require cancellation reason where appropriate.
- Preserve meeting history.
- Cancel/suppress scheduled reminders.
- Record cancellation activity.
- Prevent future one-hour reminder delivery.
- Update list/calendar display.

Don't delete meeting history.

## 32.6 Completion

After the meeting:

- Authorized owner/Manager marks the meeting Completed.
- Record completion time.
- Preserve agenda.
- Preserve notes.
- Preserve decisions.
- Preserve action items.
- Stop future scheduling notifications.

Meeting completion must not automatically mark associated project tasks Done.

## 32.7 Calendar Data

Provide a calendar-compatible API or data transformation.

Calendar entries should include:

- Meeting ID.
- Title.
- Client.
- Start.
- End.
- Status.
- Owner.
- Project when applicable.

Enforce authorization before returning calendar events.

Employees must not receive other clients' private meeting details.

## 32.8 Overlapping Meetings

If an assigned Project Manager already has another meeting during the selected time:

- Detect the overlap where practical.
- Show a warning.
- Avoid silently moving the meeting.

Do not implement a complex shared-resource scheduling engine or external calendar synchronization.

Unless a stricter requirement already exists, treat overlap as a warning rather than automatically blocking authorized scheduling.

## 32.9 Step 32 Tests

Test:

- Successful scheduling.
- Required fields.
- Start/end validation.
- Timezone conversion.
- Different timezone display.
- Rescheduling.
- Schedule history.
- Cancellation.
- Completion.
- Meeting overlap warning.
- Client/project filter.
- Calendar event isolation.
- Concurrent reschedule safety.

Fix failures before Step 33.

---

# STEP 33 — MEETING NOTES, DECISIONS & ACTION ITEMS

## 33.1 Objective

After meetings, Project Managers must record discussion details, decisions, and follow-up responsibilities.

Most importantly:

**Meeting action items must be convertible into real project tasks using the existing task engine.**

Do not build a parallel task management system.

## 33.2 Meeting Notes

Support editable meeting notes.

Fields/content:

- Discussion summary.
- Client concerns.
- Topics discussed.
- Follow-up information.
- Important observations.

Use simple rich-enough text entry.

Do not introduce a complicated collaborative document editor.

Use standard textarea or existing approved editor components.

Do not add external document storage.

## 33.3 Decisions

Support recording explicit decisions separately from general discussion notes.

Example:

Decision:

Launch two new Singapore advertisements next week.

Decision:

Review lead qualification criteria.

Decision:

Prioritize campaigns for already destination-decided travellers.

Store decisions in a structured or clearly separated format.

Preserve edit history/audit for important changes.

## 33.4 Meeting Action Item Model

Create an application-domain model:

`meetingActionItems`

Suggested fields:

- _id
- meetingId
- clientId
- projectId (optional)
- title
- description
- responsibleJobRoleId
- assignedUserId
- dueAt
- priority
- status or conversion state
- linkedTaskId
- createdBy
- updatedBy
- createdAt
- updatedAt
- version

Use the smallest schema needed to support the approved business workflow.

Do not create another independent six-status task lifecycle.

An action item is a meeting follow-up record.

A converted action item becomes linked to a REAL Task.

## 33.5 Action Item Creation

After a meeting, authorized users can:

1. Click Add Action Item.
2. Enter action title.
3. Enter instructions.
4. Select responsible job role.
5. Select employee or resolve eligible assignee.
6. Set due date/time.
7. Select priority.
8. Select associated client project when needed.
9. Save action item.

Example:

Title:

Create two new Singapore video ad scripts.

Role:

Video Ad Script Writer.

Assigned employee:

Eligible client-specific Script Writer.

Due:

User-selected date and time.

## 33.6 Assignment Rules

Use existing Phase 3 employee assignment logic.

Priority:

1. Explicit eligible selected employee.
2. Client-designated primary employee for the job role, when automatic resolution is authorized.
3. Manual Manager selection when unresolved.

Never randomly assign an employee.

Never use the Project Manager as a fallback for unrelated functional roles.

Ensure:

- Employee exists.
- Employee active.
- Employee holds role.
- Employee authorized for client.
- Correct project/client scope.

Show Needs Assignment when unresolved.

## 33.7 Convert Action Item Into Task

This is a major acceptance requirement.

Authorized Manager selects:

**Create Task**

The system must:

1. Validate meeting.
2. Validate action item.
3. Validate actor permissions.
4. Validate target project.
5. Confirm project belongs to meeting's client.
6. Validate assignment.
7. Validate deadline.
8. Use the existing Task service.
9. Create an actual Task under the selected project.
10. Populate task title, description, role, assignee, due date and priority.
11. Set sourceMeetingId or compatible meeting origin metadata.
12. Link task back to meetingActionItem.
13. Preserve proper task status and approval rules.
14. Write audit/activity records.
15. Emit existing eligible task-assignment notification intents.
16. Return Task ID and deep link.
17. Show linked task in Meeting Detail.

Do not call Meta's API inside the transaction.

Existing Phase 5 notification outbox handles eligible notifications asynchronously.

## 33.8 Project Selection

A meeting may be linked to a project or only to a client.

When converting an action item:

- If meeting has a project, preselect it.
- If meeting has no project, require selection of an authorized project belonging to the same client.
- Do not silently create a new project.
- Do not assign the task to a project from another client.

## 33.9 Conversion Idempotency

An action item must not create duplicate project tasks after:

- Double-click.
- Browser retry.
- Network timeout.
- Concurrent Manager actions.

Implement an atomic/idempotent conversion.

An action item with an existing linked Task should return or display the existing link.

If conversion conflicts with changed input, return a clear conflict.

Do not create multiple duplicate tasks unintentionally.

## 33.10 Action Item Editing

Before conversion:

- Authorized users may update title, description, role, employee, due date and priority.

After conversion:

- Preserve the original action item.
- Display linked task and current task status.
- Do not silently mutate the real Task whenever someone edits meeting notes.
- Subsequent task changes should use the existing Task API and permission rules.

## 33.11 Action Item Display

Meeting Detail must show:

- Action item title.
- Owner/role.
- Deadline.
- Conversion status.
- Linked task, if converted.
- Current task status.
- Create Task action when eligible.

Show clear states:

- Not Converted.
- Needs Assignment.
- Converted to Task.

These are action-item states/indicators, not new Task statuses.

## 33.12 Post-Meeting Notes Reminder

If a meeting is Completed but has no notes:

Show a subtle in-app reminder to the authorized meeting owner.

Do not repeatedly send WhatsApp messages about missing notes.

Do not create nagging recurring alerts.

Do not prevent all work simply because notes are missing.

## 33.13 Action Item REST APIs

Implement suitable endpoints:

GET /api/v1/meetings/:meetingId/action-items

POST /api/v1/meetings/:meetingId/action-items

PATCH /api/v1/meetings/:meetingId/action-items/:actionItemId

DELETE /api/v1/meetings/:meetingId/action-items/:actionItemId

POST /api/v1/meetings/:meetingId/action-items/:actionItemId/create-task

And appropriate notes/decisions update endpoints or existing Meeting PATCH semantics.

Use server-side validation and authorization.

Preserve converted action item history instead of deleting task-linked records.

## 33.14 Step 33 Tests

Test:

1. Add meeting notes.
2. Record decisions.
3. Notes edit permissions.
4. Create action item.
5. Invalid employee assignment.
6. Different functional job roles.
7. Missing assignee warning.
8. Convert action item into Task.
9. Correct Task project.
10. Correct client association.
11. Task appears in employee's My Tasks.
12. Meeting ↔ Task links.
13. Conversion double-click.
14. Conversion retry.
15. Concurrent conversion.
16. Cross-client conversion rejected.
17. Converted action item cannot silently duplicate work.
18. Existing task approval engine remains functional.
19. Existing assignment notifications are generated correctly.
20. Completed meeting missing-notes indicator.

Fix failures before Step 34.

---

# STEP 34 — MEETING WHATSAPP NOTIFICATIONS & ONE-HOUR REMINDERS

## 34.1 Objective

Integrate meeting scheduling with the existing Phase 5 notification system.

Do not create a separate WhatsApp sending service.

Reuse:

- notificationOutbox.
- notificationLogs.
- Existing in-app notification center.
- Existing Meta provider.
- Existing template registry.
- Agenda v6 worker.
- Existing consent validation.
- Existing retry/idempotency logic.

## 34.2 Meeting Notification Events

Support:

- meeting.assigned
- meeting.rescheduled
- meeting.reminder

If existing naming differs, use the established event naming consistently.

Optional meeting cancellation events may be supported if permitted by the existing notification architecture and requirements.

Do not duplicate notification pipelines.

## 34.3 Meeting Assignment Notification

When a meeting is scheduled:

Recipient:

Assigned Project Manager.

Send notification intent after the transaction commits.

Example information:

- Meeting title.
- Client name.
- Meeting date.
- Start time.
- Timezone.
- Meeting link.
- Internal meeting detail URL.

If there are authorized internal attendees, in-app notification may be provided as appropriate.

Do not automatically message external client contacts.

External client WhatsApp reminders are not part of the approved MVP.

## 34.4 Meeting Reschedule Notification

When meeting timing changes:

- Record a rescheduled event.
- Notify assigned Project Manager.
- Invalidate old reminder.
- Generate a new reminder.
- Preserve notification history.
- Prevent repeated messages for the same unchanged schedule version.

If meeting owner changes:

- Prevent stale pending notifications to old owner.
- Notify new assigned owner appropriately.

## 34.5 One-Hour Meeting Reminder

Default:

**Exactly one hour before meeting start.**

Recipient:

Assigned Project Manager.

Example:

Meeting: Singapore Campaign Review.

Start: 4 PM.

Reminder target: 3 PM.

Conditions:

- Meeting still exists.
- Meeting is scheduled/actively rescheduled.
- Meeting has not been cancelled.
- Meeting is not completed.
- Meeting start time has not already passed.
- Recipient is current assigned owner.
- Recipient account is active.
- Reminder belongs to current meeting schedule version.

Use the existing worker.

## 34.6 Rescheduling Reminder Safety

Example:

Original:

Meeting at 3 PM.

Old reminder:

2 PM.

Rescheduled:

Meeting at 5 PM.

New reminder:

4 PM.

Required behavior:

1. Old reminder is invalidated.
2. New reminder is scheduled.
3. Both carry the appropriate schedule-version identity.
4. Worker checks current version before sending.
5. Old stale reminder cannot be delivered.
6. No duplicate reminder is sent for the new version.

Use a persisted idempotency key.

Do not rely only on deleting in-memory timers.

## 34.7 Meeting Cancellation

When meeting is cancelled:

- Cancel/suppress pending reminders.
- Do not send future meeting reminders.
- Preserve existing notification logs.
- In-app meeting status updates immediately.

If cancellation notification is implemented, ensure it is not confused with a reminder and is deduplicated.

## 34.8 Completed Meetings

After completion:

- Suppress future reminders.
- Preserve delivery/audit history.
- Do not notify repeatedly about missing notes through WhatsApp.

## 34.9 WhatsApp Consent

Before sending:

- Valid phone number.
- Valid opt-in.
- Active user account.
- No opt-out.
- Approved template.
- WhatsApp channel enabled.
- Correct recipient.
- Current meeting state.

No consent means no WhatsApp send.

In-app notification should remain available where appropriate.

## 34.10 Meta Template Mapping

Support mappings for:

- Meeting assigned.
- Meeting rescheduled.
- Meeting reminder.

Example placeholders:

employee_name

client_name

meeting_title

start_at_local

meeting_url

meeting_detail_url

Timezone should be correctly rendered in human-readable format.

Use actual approved Meta templates only.

Do not assume a locally configured name means Meta has approved it.

## 34.11 Live Meta Limitation

The Phase 5 report confirmed:

**Live WhatsApp Cloud API messaging is not enabled because credentials and approved templates are unavailable.**

Preserve this state.

Default:

WHATSAPP_NOTIFICATIONS_ENABLED=false

Use a mock Meta provider for tests.

Do not turn on production delivery automatically.

Do not send real messages to actual employees without valid consent and authorized configuration.

Report:

- Locally implemented.
- Mock provider tested.
- Real Meta integration unverified/blocked.

Do not claim real WhatsApp reminders have been delivered.

## 34.12 Idempotency and Recovery

Implement:

- Persistent Agenda scheduling.
- Unique reminder event keys.
- Worker restart recovery.
- Revalidation at dispatch time.
- Safe retry handling.
- Stale reminder suppression.
- No duplicate reminders from concurrent workers.
- Correct cancellation/reassignment behavior.

Do not create a second scheduler.

## 34.13 Notifications After Action Item Conversion

When a meeting action item becomes a real Task:

- Use the existing task-assignment event pathway.
- Do not create a separate duplicate meeting-specific task notification.
- Respect task readiness.
- Respect employee consent.
- Preserve event idempotency.

## 34.14 Step 34 Tests

Test:

1. Meeting scheduled notification.
2. Correct owner recipient.
3. No unrelated recipient.
4. One-hour reminder scheduled correctly.
5. Reminder uses correct timezone.
6. Reschedule cancels old reminder.
7. New reminder created.
8. Old reminder not delivered.
9. Cancellation suppression.
10. Completion suppression.
11. Owner reassignment.
12. Missing consent.
13. Opt-out.
14. Inactive owner.
15. Missing approved Meta template.
16. Mock WhatsApp sending.
17. Duplicate event prevention.
18. Worker restart recovery.
19. Concurrent reminder execution.
20. Task-conversion notification without duplication.
21. No historical notification flood.
22. No live Meta sending during tests.

Fix failures before Step 35.

---

# STEP 35 — COMPLETE MEETINGS FRONTEND, CALENDAR & DAILY SCHEDULE

## 35.1 Objective

Build a polished, responsive Meetings module within the existing React application.

Use existing application layout and design patterns.

No second frontend framework.

No fake calendar entries.

No placeholder buttons.

Every supported interaction must use real APIs.

## 35.2 Navigation

Enable:

**Meetings**

in the existing sidebar.

Authorized users should see:

- Meetings list.
- Meetings calendar.
- My Meetings.
- Meeting detail.
- New Meeting.
- Relevant meeting actions.

Role-based navigation must respect actual backend permissions.

## 35.3 Meetings List View

Display:

- Meeting title.
- Client.
- Project.
- Responsible Project Manager.
- Meeting date.
- Start time.
- End time.
- Status.
- Action.

Filters:

- Client.
- Project.
- Owner.
- Date range.
- Status.

Useful views:

- Today.
- Upcoming.
- Completed.
- Cancelled.

Use TanStack Table where appropriate.

Support pagination and sorting.

## 35.4 Meeting Calendar View

Use:

FullCalendar React with standard MIT-licensed plugins.

Provide:

- Month view.
- Week view.
- Day/time view if supported by the approved MIT plugins.
- Today button.
- Next/previous navigation.
- Client filter.
- Owner filter.
- Click meeting to open details.

Show meeting title and time clearly.

Do not expose private meeting details through unauthorized calendar data.

If timeGrid or another desired view requires a license or component outside the approved stack, use only supported MIT options.

Do not purchase or introduce premium plugins.

## 35.5 Meeting Creation Form

Fields:

- Client.
- Optional project.
- Meeting title.
- Agenda.
- Date.
- Start time.
- End time.
- Timezone.
- Project Manager.
- Internal attendees.
- Meeting URL or location.

Requirements:

- Clear validation.
- Accessible controls.
- Correct date/time conversion.
- Mobile usability.
- Loading/error/success states.
- Correct employee eligibility.

## 35.6 Meeting Detail Page

Show:

### Meeting Overview

- Meeting title.
- Client.
- Project.
- Date/time.
- Timezone.
- Owner.
- Attendees.
- Status.
- Meeting URL/location.

### Agenda

- Meeting discussion topics.

### Discussion Notes

- Editable notes for authorized users.

### Decisions

- Decisions recorded during/after meeting.

### Action Items

- Follow-up work.
- Responsible employee.
- Deadline.
- Conversion status.
- Linked task.

### Activity History

- Important meeting changes.

Actions:

- Edit.
- Reschedule.
- Cancel.
- Mark Completed.
- Add/Edit Notes.
- Record Decisions.
- Add Action Item.
- Convert Action Item to Task.

Display only actions permitted for the current user.

## 35.7 Reschedule Interface

Use a clear rescheduling dialog.

Show:

- Current date/time.
- Proposed date/time.
- Timezone.
- Optional reason.

On confirmation:

- Save changes.
- Refresh meeting details.
- Update calendar.
- Update upcoming meetings.
- Reflect new reminder schedule.

Do not require users to create a new meeting manually.

## 35.8 Notes and Decisions Interface

Provide simple editable sections.

Support:

- Save notes.
- Edit notes.
- Add decision.
- Edit decision where authorized.
- View prior important changes.

Do not implement real-time collaborative document editing.

Do not add file uploads.

## 35.9 Action Item Interface

Support:

- Add Action Item.
- Edit Action Item.
- Select job role.
- Select assignee.
- Select due date.
- Select project.
- Create Task.
- Open linked Task.

After conversion, show actual Task status.

Do not display an active Create Task button that generates duplicates.

## 35.10 Project Manager Daily Schedule

This is an important business requirement.

The Project Manager should see both:

- Assigned tasks.
- Scheduled client meetings.

Provide a unified daily schedule view.

Example:

Today — Project Manager

10:00 AM
Singapore Campaign Client Meeting.

12:00 PM
Review Pending Video Ad Approval.

2:00 PM
Complete Client Onboarding Checklist.

4:00 PM
Kashmir Campaign Strategy Meeting.

Use actual task and meeting data.

Tasks without exact scheduled start times may be grouped separately under:

Due Today / Tasks.

Do not invent exact meeting-like start times for task deadlines.

## 35.11 Dashboard Integration

Expand the existing Overview dashboard.

Admin:

- Meetings today.
- Upcoming meetings.
- Completed meetings.
- Meetings pending notes.
- Open meeting action items.
- Converted meeting tasks where relevant.

Manager/Project Manager:

- My meetings today.
- Upcoming client meetings.
- Assigned project meetings.
- Meetings without notes.
- Outstanding follow-ups.

Employee:

- Meetings explicitly assigned/authorized to view.
- Their converted tasks through existing My Tasks.

All counts must be calculated using authorized real data.

No fabricated statistics.

## 35.12 Client Detail Integration

On Client Detail:

Show a Meetings section or tab with:

- Upcoming meetings.
- Previous meetings.
- Responsible Manager.
- Meeting status.
- Link to Meeting Detail.

Respect client visibility permissions.

## 35.13 Project Detail Integration

On Project Detail:

Show related meetings when a meeting is associated with the project.

Allow authorized navigation to meeting records.

Do not automatically expose all meetings to everyone who sees the project.

## 35.14 Notification Center Integration

Existing Notification Center should display:

- Meeting assigned.
- Meeting rescheduled.
- Meeting reminder.

Include deep links to meeting details.

Opening an event must respect current access permissions.

No bypass through notification links.

## 35.15 Post-Meeting Notes Indicator

When a meeting is Completed but has no notes:

Display:

**Meeting Notes Pending**

Show this only to appropriate authorized users.

Do not repeatedly send WhatsApp notifications about this condition.

## 35.16 Mobile UI

Support:

- Mobile meeting list.
- Mobile calendar navigation.
- Meeting detail.
- Schedule meeting.
- Reschedule meeting.
- Notes editing.
- Decisions.
- Action item creation.
- Convert action item to task.
- Daily schedule.

Use the existing design system.

Make forms scrollable and accessible.

Avoid horizontal overflow.

## 35.17 Step 35 Tests

Test:

1. Meeting list renders.
2. Filters work.
3. Calendar displays actual meetings.
4. Calendar date navigation.
5. Create Meeting form.
6. Project/client selection.
7. Owner selection.
8. Meeting Detail.
9. Reschedule dialog.
10. Cancel action.
11. Complete action.
12. Notes editing.
13. Decision recording.
14. Action item creation.
15. Task conversion.
16. Linked task navigation.
17. Project Manager daily schedule.
18. Dashboard counts.
19. Client meetings tab.
20. Project meetings section.
21. Notification deep links.
22. Mobile calendar.
23. Mobile meeting form.
24. Unauthorized controls hidden.

Fix failures before Step 36.

---

# STEP 36 — SECURITY, END-TO-END TESTING, REGRESSION & COMPLETION

## 36.1 Objective

Verify that Meetings operate correctly with the existing client, project, task, assignment, approval, notification, and worker systems.

No feature should be declared complete based only on a successful build.

## 36.2 Required Business E2E Scenario

Create isolated test data.

Client:

Travel Enfield.

Project:

Singapore Meta Ads Campaign.

Project Manager:

Authorized Manager assigned to this client.

Other team members:

- Video Ad Script Writer.
- Video Editor.
- Performance Marketer.

Meeting:

Singapore Campaign Performance Review.

Agenda:

- Campaign results.
- Lead quality.
- Upcoming creatives.
- Sales follow-up issues.
- Next campaign actions.

Required workflow:

1. Admin/Manager schedules meeting.
2. Selects Travel Enfield.
3. Associates Singapore project.
4. Assigns Project Manager.
5. Sets start/end time.
6. Saves meeting.
7. Meeting appears in calendar.
8. Meeting appears in Project Manager's daily schedule.
9. In-app notification is created.
10. One-hour reminder is scheduled.
11. Manager reschedules meeting.
12. Old reminder becomes invalid.
13. New reminder is scheduled.
14. Manager completes meeting.
15. Manager records discussion notes.
16. Manager records decisions.
17. Manager creates action items.
18. Action items receive appropriate functional roles.
19. Manager selects Create Task.
20. A real Task is created in Singapore project.
21. Task links back to original meeting.
22. Employee sees task in My Tasks.
23. Existing task notifications apply without duplication.
24. Existing approval/dependency systems remain intact.

Use real backend APIs and an isolated MongoDB test database.

## 36.3 Meeting Scheduling Security Tests

Verify:

- Admin authorized.
- Assigned Manager authorized.
- Unassigned Manager restricted.
- Employee limited to explicit meeting permission.
- Cross-client meeting access rejected.
- Cross-project reference rejected.
- Attendee cannot escalate privileges.
- Meeting owner cannot gain unauthorized client access.
- Protected notes remain private.
- Client/project ID manipulation cannot expose records.

## 36.4 Reminder Tests

Using controllable clocks:

- One-hour reminder fires at correct time.
- Different timezone correctly handled.
- Cancelled meeting produces no reminder.
- Completed meeting produces no reminder.
- Reschedule invalidates old reminder.
- New reminder uses correct date/time.
- Changing owner invalidates old-recipient pending sends.
- Worker restart preserves correct scheduling.
- Concurrent workers do not create duplicate logical reminder events.
- Opted-out employees receive no WhatsApp.
- In-app reminders remain available.
- No historical notification flood.

No real WhatsApp sends in automated tests.

## 36.5 Action Item Tests

Verify:

- Action item creation.
- Action item editing.
- Correct assignee role.
- Valid deadline.
- Project association.
- Conversion to real Task.
- Correct task creator/audit.
- sourceMeetingId linking.
- linkedTaskId on action item.
- Double-click protection.
- Network retry protection.
- Concurrent conversion protection.
- No duplicate Tasks.
- Invalid project rejection.
- Client mismatch rejection.
- Task assignment eligibility.
- Task notification intent.
- No duplicate assignment message.

## 36.6 MongoDB Integration Tests

Test:

- Meeting model.
- Meeting indexes.
- Date validation.
- Status transitions.
- Scheduling.
- Rescheduling.
- Cancellation.
- Completion.
- Ownership.
- Attendees.
- Action item model.
- Task conversion transaction.
- Audit history.
- Idempotency.
- Optimistic concurrency.
- Notification outbox.
- Agenda reminder scheduling.
- Duplicate prevention.
- Cross-client isolation.

Use an isolated replica-set-compatible database.

Do not execute destructive tests on production data.

## 36.7 Playwright E2E Tests

Create and execute browser tests covering at least:

1. Admin login.
2. Open Meetings page.
3. Schedule meeting.
4. Select client.
5. Select optional project.
6. Set Project Manager.
7. Add agenda.
8. Set meeting date/time.
9. View meeting in calendar.
10. View meeting detail.
11. Reschedule meeting.
12. Check updated calendar entry.
13. Cancel meeting.
14. Complete another meeting.
15. Record discussion notes.
16. Record decisions.
17. Add action item.
18. Select employee/job role.
19. Convert action item into Task.
20. Open linked Task.
21. Employee sees converted task.
22. Meeting appears in Project Manager daily schedule.
23. Meeting assignment notification appears in-app.
24. Meeting reminder is scheduled.
25. Old reminder invalidated after reschedule.
26. No reminder after cancellation.
27. Missing-notes indicator appears.
28. Manager scope enforcement.
29. Employee access restrictions.
30. Cross-client IDOR prevention.
31. Mobile meeting list.
32. Mobile calendar.
33. Mobile scheduling form.
34. Mobile meeting detail.
35. Mobile action item conversion.
36. Existing task/approval regression.
37. Existing notification regression.
38. Existing template-generation regression.
39. Authentication/session regression.

These are scenarios, not automatically separate test counts.

Report the actual number of executed tests accurately.

## 36.8 Phase 1–5 Regression

Re-run tests for:

PHASE 1:
- Authentication.
- Employee management.
- Client management.
- Roles and capabilities.
- Client assignment scope.

PHASE 2:
- Projects.
- Tasks.
- Subtasks.
- Approvals.
- Revisions.
- My Tasks.

PHASE 3:
- Dependencies.
- Automatic task unlocking.
- Client-specific assignment.
- Downstream review.

PHASE 4:
- Campaign templates.
- Onboarding templates.
- Atomic project generation.
- Template versioning.
- Idempotency.

PHASE 5:
- Notification outbox.
- Consent.
- In-app notifications.
- Agenda worker.
- Deadline reminders.
- Overdue escalation.
- Weekly campaign reviews.
- Meta mock provider.
- Provider webhook security.

Do not break previously completed features.

## 36.9 Security Audit

Review at least:

1. Authentication.
2. Session security.
3. Manager/Employee role separation.
4. Meeting client scope.
5. Meeting project scope.
6. Meeting ownership checks.
7. Attendee permissions.
8. Meeting notes privacy.
9. Decision record authorization.
10. Action item assignment eligibility.
11. Cross-client task conversion.
12. Double-conversion prevention.
13. Transaction consistency.
14. Notification recipient accuracy.
15. Stale reminder suppression.
16. Reschedule idempotency.
17. Opt-out enforcement.
18. Webhook security regression.
19. Sensitive data redaction.
20. API rate limiting.
21. IDOR prevention.
22. Audit-log completeness.
23. Concurrent updates.
24. No credentials stored in meeting notes unintentionally.
25. No unauthorized deep-link access.

Fix confirmed vulnerabilities.

Document remaining risks.

## 36.10 Full Quality Gates

Run:

pnpm format:check

pnpm lint

pnpm typecheck

pnpm build

pnpm test

Relevant Playwright E2E commands.

Ensure MongoDB transaction-dependent tests execute against a replica set.

Report exact:

- Passed.
- Failed.
- Skipped.
- Not executed.

Do not describe skipped tests as verified.

If a critical test cannot be executed, state the blocker clearly.

## 36.11 Performance and Reliability

Verify:

- Calendar date-range queries use suitable indexes.
- Meeting lists are paginated.
- No unnecessary N+1 database queries.
- Reminder jobs do not accumulate indefinitely.
- Concurrent rescheduling remains consistent.
- Action-item conversions are idempotent.
- Existing worker does not stall task notifications.
- MongoDB transactions remain reasonably short.
- Calendar remains usable for the agency's expected client volume.

Do not build unnecessary distributed infrastructure.

## 36.12 Documentation

Update:

- README.md
- AGENTS.md
- docs/01-technology-stack.md if required.
- docs/03-authorization.md
- docs/04-data-model.md
- docs/05-api.md
- docs/06-frontend.md
- docs/07-development-phases.md
- docs/08-testing-strategy.md
- docs/09-deployment.md where worker behavior changes.
- docs/decisions.md
- docs/traceability.md

Preserve the original master requirements text in:

docs/00-product-requirements.md

Document:

- Meeting database schema.
- Meeting statuses and transition rules.
- Meeting access permissions.
- Calendar implementation.
- Timezone handling.
- Rescheduling behavior.
- Notes and decisions.
- Meeting action item model.
- Conversion to Task.
- Idempotency strategy.
- Notification integration.
- One-hour reminders.
- Worker scheduling.
- Consent.
- API endpoints.
- Test procedures.
- Known limitations.
- Phase 7 integration requirements.

---

# 5. STRICT PHASE BOUNDARIES

## PHASE 6 INCLUDES

- Meeting database.
- Meeting scheduling.
- Meeting rescheduling.
- Meeting cancellation.
- Meeting completion.
- Meeting calendar.
- Meeting agendas.
- Meeting notes.
- Meeting decisions.
- Meeting action items.
- Convert action item into Task.
- Meeting/task cross-linking.
- Project Manager daily schedule.
- Meeting assignment notification.
- Meeting reschedule notification.
- One-hour meeting reminder.
- Client/project meeting views.
- Dashboard integration.
- Security testing.
- Documentation.

## PHASE 7 DOES NOT START

Do not perform:

- AWS production deployment.
- New infrastructure provisioning.
- Production DNS configuration.
- Production HTTPS rollout.
- Full production load-testing program.
- New hosting provider setup.
- Final external security assessment.

You may prepare documentation needed for Phase 7.

Do not deploy without explicit user approval.

## OTHER EXCLUSIONS

Do not implement:

- Google Calendar integration.
- Microsoft Outlook Calendar integration.
- Zoom API integration.
- Automatic video conferencing creation.
- AI-generated meeting summaries.
- Meeting transcription.
- Employee attendance monitoring.
- Native mobile application.
- Client login portal.
- Full CRM synchronization.
- File or video hosting.
- Internal team messaging.
- Gantt chart.
- Complex visual workflow builder.

Do not introduce unapproved technologies.

---

# 6. IMPORTANT CROSS-PHASE INTEGRATION RULES

## 6.1 Reuse Task Engine

Meeting action items must create actual Tasks using existing Task services.

Do not create a second Task model.

## 6.2 Reuse Assignment Engine

Use existing role eligibility and client-specific employee mapping rules.

Never randomly select employees.

## 6.3 Reuse Approval Engine

Converted tasks may use existing approval configuration.

Do not create a meeting-specific approval system.

## 6.4 Reuse Notifications

Use existing Phase 5 outbox, Agenda worker, consent and provider infrastructure.

Do not create a second WhatsApp integration.

## 6.5 Protect Historical Data

Rescheduling must not destroy previous meeting information.

Task conversion must preserve its action-item origin.

Meeting cancellation must not automatically cancel already created project tasks.

## 6.6 Preserve Client Isolation

Meeting attendees, action-item owners and notification recipients must not receive unrelated client information.

## 6.7 Preserve Live WhatsApp State

Real Meta outbound sending remains disabled unless separately configured and authorized.

Use mock providers during automated testing.

## 6.8 Do Not Invent Scheduling Data

Use the actual meeting times entered by the user.

Do not fabricate meeting times.

Do not fabricate task start times for unified daily schedule.

## 6.9 Maintain Minimal UI Complexity

Meeting List + Calendar + Detail + Daily Schedule are sufficient.

No complicated calendar resource planner is required.

---

# 7. REQUIRED IMPLEMENTATION ORDER

Execute in this exact order.

STEP 31:
- Shared Zod contracts.
- Meeting model.
- Meeting indexes.
- Permissions.
- Meeting services.
- Meeting APIs.
- Audit.
- Tests.

STEP 32:
- Scheduling.
- Rescheduling.
- Cancellation.
- Completion.
- Timezone handling.
- Calendar queries.
- Tests.

STEP 33:
- Notes.
- Decisions.
- Action items.
- Action item assignment.
- Task conversion.
- Meeting/task linking.
- Idempotency.
- Tests.

STEP 34:
- Notification integration.
- Assignment notification.
- Reschedule notification.
- One-hour reminders.
- Agenda worker.
- Stale reminder cancellation.
- Consent and mock delivery.
- Tests.

STEP 35:
- Meeting list.
- Meeting calendar.
- Meeting Detail.
- Create/Edit/Reschedule forms.
- Notes/decisions UI.
- Action items UI.
- Project Manager schedule.
- Dashboard integration.
- Client/project integration.
- Mobile responsiveness.
- Tests.

STEP 36:
- Integration verification.
- Security audit.
- MongoDB transaction tests.
- Playwright E2E.
- Phase 1–5 regression.
- Documentation.
- Final report.

Continue automatically after each verified step.

Do not request approval between steps unless genuinely blocked.

---

# 8. FINAL PHASE 6 ACCEPTANCE CRITERIA

Phase 6 is COMPLETE only when:

1. Meetings are separate from Tasks.
2. Meetings belong to clients.
3. Optional project association works.
4. Cross-client project references are rejected.
5. Meetings have valid assigned owners.
6. Agenda supports multiple discussion topics.
7. Start/end date and time validation works.
8. Timezone conversion works correctly.
9. Meeting statuses work.
10. Rescheduling preserves Meeting identity.
11. Previous schedule is auditable.
12. Cancellation suppresses reminders.
13. Completion suppresses reminders.
14. Owner changes invalidate stale notifications.
15. Meeting list works.
16. Calendar works.
17. Client/project filters work.
18. Meeting Detail works.
19. Meeting notes can be recorded.
20. Decisions can be recorded.
21. Action items can be created.
22. Action items support role/employee/deadline.
23. Action items convert into real Tasks.
24. Linked Tasks preserve meeting origin.
25. Converted tasks appear in My Tasks.
26. Duplicate conversion is prevented.
27. Existing assignment logic is reused.
28. Existing task notifications are reused.
29. Authorized Managers can manage assigned meetings.
30. Employees cannot access unrelated meetings.
31. Meeting attendees cannot escalate permissions.
32. One-hour reminders are scheduled correctly.
33. Rescheduling invalidates old reminders.
34. No duplicate reminder events.
35. Worker restart recovery works.
36. WhatsApp consent is enforced.
37. In-app meeting notifications work.
38. Real WhatsApp remains disabled unless approved.
39. Project Manager sees meetings alongside tasks.
40. Completed meetings without notes show a reminder in-app.
41. Client Detail shows permitted meetings.
42. Project Detail shows permitted meetings.
43. Mobile meeting views work.
44. API security audit passes.
45. MongoDB integration tests pass.
46. Playwright E2E tests pass.
47. Phase 1–5 regressions pass.
48. Lint passes.
49. Typecheck passes.
50. Build passes.
51. Format check passes.
52. Documentation is updated.
53. No prohibited technologies were introduced.

If an acceptance criterion is incomplete, document it honestly.

Do not report full completion if a critical criterion fails.

---

# 9. FINAL PHASE 6 COMPLETION REPORT

After completing Step 36, provide a consolidated report containing:

1. Overall Phase 6 status.
2. Step 31 summary.
3. Step 32 summary.
4. Step 33 summary.
5. Step 34 summary.
6. Step 35 summary.
7. Step 36 summary.
8. Files created/modified.
9. MongoDB models and indexes.
10. Meeting status/lifecycle design.
11. Authorization and client scope.
12. Meeting scheduling and rescheduling.
13. Timezone handling.
14. Meeting calendar.
15. Meeting notes and decisions.
16. Action item management.
17. Action-item-to-task conversion.
18. Task origin and cross-linking.
19. Idempotency and concurrency controls.
20. Meeting notification integration.
21. One-hour reminder design.
22. Agenda worker scheduling/recovery.
23. WhatsApp consent and mock-provider results.
24. Frontend pages/components.
25. Dashboard and Project Manager daily schedule.
26. REST API endpoints.
27. Unit/integration test results.
28. Playwright E2E results.
29. Phase 1–5 regression results.
30. Security audit findings.
31. Bugs found and fixed.
32. Known limitations and deferred work.
33. Documentation updated.
34. Git status and checkpoints.
35. Readiness for Phase 7.

Include exact counts:

- Passed.
- Failed.
- Skipped.
- Not executed.

Clearly distinguish:

- Implemented.
- Tested locally.
- Verified with mocked WhatsApp provider.
- Verified with real Meta provider.
- Blocked pending external configuration.
- Deferred to Phase 7.

Do not claim real WhatsApp delivery if only mocks were used.

---

# 10. FINAL STOP INSTRUCTION

After completing Step 36:

**STOP DEVELOPMENT.**

Do not begin Phase 7 without explicit approval.

Do not deploy to AWS EC2.

Do not enable real WhatsApp sending automatically.

Provide the final Phase 6 report and wait for the user's next instruction.

The required outcome is a complete, secure, reliable Client Meeting Management System where Project Managers can schedule client meetings, maintain agendas and notes, record decisions, generate real follow-up tasks, view meetings alongside their assigned work, and receive timely meeting reminders through the existing notification infrastructure.