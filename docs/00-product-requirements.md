# INTERSCALE MARKETING — COMPLETE PROJECT MANAGEMENT APPLICATION
## Master Product Requirements, Final Technology Stack & Development Instructions

> **Provenance:** This document preserves the authoritative requirements provided
> as text in the OpenCode conversation. The original PDFs (Project Management MVP
> Version 1.1 dated 16 October 2026) are **not present in this repository** and
> were not copied from any file. This is a faithful transcription of the text
> that was supplied and approved.

---

# 0. YOUR ROLE AND INSTRUCTIONS

Act as a Principal Software Architect, Senior Full-Stack TypeScript Engineer, Database Architect, Security Engineer, and Technical Lead.

You are responsible for architecting and incrementally developing a production-quality internal **Project & Team Management System for Interscale Marketing**.

Project directory:

`C:\Users\User\Desktop\vikas\project-management`

Git Bash equivalent:

`/c/Users/User/Desktop/vikas/project-management`

The repository is currently empty.

I am using **OpenCode** to develop this project.

This prompt contains the authoritative requirements for the entire application.

It consolidates:

1. Original Project Management MVP Version 1.1 requirements, dated 16 October 2026.
2. Updated authentication, roles, and employee account management requirements.
3. Final approved technology stack.
4. Security, database, permission, and architectural corrections identified during planning.

**You must understand the complete application before beginning development.**

Do not treat the application as a generic ClickUp clone.

Do not silently remove features, change workflows, substitute technologies, or invent requirements.

Do not implement the entire application in one attempt.

We will build it in separately tested phases.

Your first assignment is to review the full specification and produce a corrected implementation plan for Phase 1.

**Do not write application code until I explicitly approve your plan.**

---

# 1. BUSINESS CONTEXT

## 1.1 Company

Company: **Interscale Marketing**

Business: Performance marketing agency specializing in B2C travel agencies.

The company manages multiple travel agency clients, each running marketing campaigns for destinations such as:

- Singapore
- Kashmir
- Goa
- Bali
- Dubai
- Vietnam

Initial system capacity:

- Approximately 20 active clients.
- Multiple campaigns per client.
- Four departments.
- Employees working across multiple clients.
- Employees potentially holding multiple functional job roles.

This is an internal application for agency employees and management.

It is not a client-facing SaaS application.

It must remain straightforward, responsive, secure, and maintainable.

## 1.2 Product Objective

The application must help the agency:

1. Manage clients and their destination campaigns.
2. Organize projects, tasks, and real subtasks.
3. Automatically assign tasks based on client-specific employees and job roles.
4. Manage dependencies between employees' work.
5. Require manager approval when configured.
6. Automatically unlock subsequent work after prerequisites are approved or completed.
7. Send task notifications and deadline reminders through WhatsApp.
8. Schedule and manage client meetings.
9. Convert meeting action items into assigned tasks.
10. Monitor overdue tasks, pending approvals, blocked work, and employee workloads.
11. Automatically generate campaign and onboarding projects from reusable templates.
12. Maintain a complete history of important changes.

## 1.3 Core Product Promise

Every client and campaign stays organized.

Every employee knows exactly what work is assigned to them.

When work is approved, the next responsible employee automatically receives actionable work.

Management can monitor progress without manually coordinating every task.

WhatsApp keeps employees informed about assignments and deadlines.

---

# 2. APPLICATION ARCHITECTURE AND HIERARCHY

The application has one agency workspace.

Required hierarchy:

**Workspace → Client → Project → Task → Subtask**

Example:

Interscale Marketing
- Travel Enfield
  - Singapore Ad Campaign
    - Campaign Brief & Competitor Research
    - Produce Singapore Video Ad
      - Write Video Ad Script
      - Edit Video Ad
    - Write 5 Meta Ad Copies per Ad
    - Campaign Draft & Tracking
    - Launch Meta Campaign
    - Weekly Campaign Review
  - Goa Ad Campaign
  - Kashmir Ad Campaign
  - Client Onboarding & Setup

Important:

- Each destination campaign is a separate project.
- Client onboarding is also a project.
- Projects belong to clients.
- Tasks belong to projects.
- Subtasks belong to parent tasks.
- Departments are organizational groupings, not project containers.
- No mandatory Space, Folder, or List hierarchy.
- A subtask is not a simple checklist item.
- A subtask is a complete independently actionable work record.

Project types:

- Campaign
- Onboarding
- General

Project statuses:

- Planned
- In Progress
- Live/Ongoing
- On Hold
- Completed
- Cancelled

Project status and task status must remain separate.

The application is a responsive web application.

No native mobile application is required for MVP.

---

# 3. DEPARTMENTS AND FUNCTIONAL JOB ROLES

There are four departments.

## 3.1 Creative Production

Functional job roles:

- Video Ad Script Writer
- Video Editor
- Graphic Designer (when needed)

Responsibilities:

**Video Ad Script Writer**
- Write video advertising scripts.
- Submit scripts for manager approval.
- Revise rejected scripts.

**Video Editor**
- Receive editing tasks after script approval.
- Edit campaign video advertisements.
- Submit edited videos for approval.
- Revise videos when necessary.

**Graphic Designer**
- Create static advertising creatives.
- Create carousel designs.
- Handle assigned graphic design work.

Creative files and videos continue to be shared through WhatsApp or external links.

The app records the task and approval status, but does not host creative files.

## 3.2 Performance Marketing

Functional job role:

**Performance Marketer**

Responsibilities:

- Competitor research.
- Campaign brief preparation.
- Meta ad copywriting.
- Five Meta ad copies for each advertisement.
- Meta campaign creation and management.
- Meta Ads tracking.
- Flow setup and dataset configuration.
- WhatsApp Max setup and flows.
- Campaign launch.
- Campaign monitoring and weekly reviews.

Ad copywriting must follow the agency's existing SOP.

The first sentence should clearly identify:

- Right audience.
- Destination.
- High-intent/destination-decided traveller.

The application stores tasks and reference links to SOPs. Automated AI evaluation of copy is not part of MVP.

## 3.3 CRM & Data Operations

Functional job role:

**CRM/Data Executive**

Responsibilities:

- Travel CRM personalization.
- Itinerary and package data entry.
- Master data entry.
- Related CRM configuration tasks.

## 3.4 Project Management

Functional job role:

**Project Manager**

Responsibilities:

- Client meeting scheduling.
- Meeting agendas.
- Discussion topics.
- Meeting notes.
- Recording decisions.
- Client requests.
- Follow-up tasks.
- Project coordination.

## 3.5 Important Job-Role Rules

A person may hold multiple job roles.

Example:

An employee may be both a Video Ad Script Writer and a Video Editor.

Functional job roles are separate from application access levels.

A Project Manager is a functional job role, not a fourth application access level.

A Project Manager will normally have Manager access, limited to their assigned client/project scope.

Do not automatically grant Manager permissions solely because a user has the Project Manager job role.

---

# 4. FINAL AUTHENTICATION REQUIREMENTS — UPDATED SPECIFICATION

This section is authoritative and overrides earlier unspecified authentication decisions.

## 4.1 Authentication Technology

Use:

- Better Auth
- @better-auth/mongo-adapter
- Better Auth Admin plugin
- MongoDB
- Email and password authentication
- Secure session cookies
- Server-managed sessions

Authentication must integrate with Express 5.

## 4.2 Initial Admin Account

The first Admin account must be created securely.

Requirements:

1. Admin email comes from server-side environment variables.
2. Initial Admin password comes from server-side environment variables.
3. Create the initial Admin using a secure one-time bootstrap script.
4. Hash passwords securely.
5. Never store plaintext passwords.
6. Never expose Admin credentials in frontend code.
7. Never write credentials to Git.
8. Never print passwords in application logs.
9. Never automatically reset an existing Admin password during application startup.
10. Bootstrap must be safe to rerun without creating duplicate accounts or overwriting existing credentials.

## 4.3 Login Only

Employees log in using:

- Email
- Password

There must be:

- No public registration page.
- No public employee signup workflow.
- No publicly accessible registration capability.
- No ability for an unauthenticated user to create an account.

Disable public signup at the authentication-library level, not merely in the frontend.

## 4.4 Employee Account Creation

Only Admin can create employee accounts.

Admin can:

- Create employee accounts.
- Assign application access levels.
- Assign one or multiple job roles.
- Configure client assignments.
- Manage employee status.
- Update permitted employee details.

Use a secure initial-password setup flow.

Acceptable MVP implementation:

- Generate a cryptographically secure temporary password.
- Show it to Admin once.
- Require the employee to change it on first login.

Alternatively, secure one-time setup links may be used when their delivery mechanism is explicitly approved.

Do not introduce an unapproved email service.

## 4.5 Application Access Levels

Exactly three application access levels:

1. Admin
2. Manager
3. Employee

These are not functional job roles.

Keep them separate from Better Auth's internal administrative role.

The Better Auth Admin plugin must not unintentionally provide additional application permissions.

All account administration endpoints must be protected server-side.

Review the installed Better Auth version and the routes registered by its plugins.

Do not assume plugin endpoints are private merely because they are unused in the frontend.

## 4.6 Authentication Security

Implement:

- Secure, HTTP-only session cookies.
- HTTPS in production.
- Trusted-origin configuration.
- Appropriate SameSite and CSRF protection.
- Rate limiting for sensitive authentication routes.
- Password hashing.
- Secure session invalidation.
- Logout.
- Protected API endpoints.
- Server-side authorization.

Prevent:

- Public account creation.
- Privilege escalation.
- Session bypass.
- Unauthorized account management.
- Unauthorized access through modified entity IDs.

---

# 5. PERMISSION MATRIX

Use the following access behavior.

| Action | Admin | Manager | Employee |
|---|---|---|---|
| View clients/projects | All | Assigned scope only | Linked/assigned work and permitted context |
| Create/edit clients | Yes | Assigned clients if explicitly allowed | No |
| Edit client team mappings | Yes | Assigned clients if explicitly allowed | No |
| Create project from template | Yes | Assigned clients | No |
| Create/reassign tasks | Yes | Assigned scope | Only own subtasks if specifically authorized |
| Update own task | Yes | Yes | Yes |
| Submit work for approval | Yes | Yes | Yes |
| Approve/reject work | Yes | If designated approver | No by default |
| Create/manage meetings | Yes | Assigned scope | Only if specifically authorized for the meeting |
| Manage templates | Yes | No | No |
| Manage workspace settings | Yes | No | No |
| Create employee accounts | Yes | No | No |
| Change employee access levels | Yes | No | No |

Additional rules:

- Every protected API must enforce authorization server-side.
- Managers must remain within their authorized clients and projects.
- Employees must not automatically receive unrestricted access to an entire client merely because they work on one task.
- Employees may view their assigned or linked work and necessary client context.
- An employee cannot approve their own submitted work unless an explicit exception is authorized.
- A designated approver must approve work when approval is required.
- Changing URL parameters must never bypass access checks.
- Never trust client-provided access levels, job roles, assignees, or client IDs without authorization checks.

The system must support optional permissions without creating additional access levels.

Audit critical permission and assignment changes.

---

# 6. CLIENT MANAGEMENT AND CLIENT-SPECIFIC TEAMS

Each client has its own designated employees.

Required designated functional roles:

- Video Ad Script Writer
- Video Editor
- Performance Marketer
- CRM/Data Executive
- Project Manager
- Graphic Designer when required

Example:

Client: Travel Enfield

- Script Writer: Employee A
- Video Editor: Employee B
- Performance Marketer: Employee C
- CRM/Data Executive: Employee D
- Project Manager: Employee E

Another client can have entirely different assigned employees.

One employee may work for multiple clients.

One employee may fill multiple roles for the same client.

## 6.1 Assignment Priority

When generating tasks from templates:

1. Use an explicitly configured template employee override, if available.
2. Otherwise use the designated employee for that client and job role.
3. Otherwise require the Manager to choose an employee manually.

Never randomly assign tasks to someone simply because they belong to the appropriate department.

If the designated employee is missing:

- Display Needs Assignment.
- Notify/show the issue to the appropriate Manager.
- Do not pretend the task has a valid assignee.
- Do not send an assignment notification to an unrelated employee.

## 6.2 Data Model Requirement

Preserve the concept of `clientRoleAssignments`.

Support one active primary designated employee per client/job-role combination.

Use appropriate unique indexes and application-side validation.

Keep client membership and authorization scope conceptually separate from primary role mappings used for automatic assignment.

Do not design the database in a way that prevents multiple job roles per employee.

---

# 7. TASK AND SUBTASK MANAGEMENT ENGINE

This is one of the most important modules.

## 7.1 Required Task Fields

Every task and subtask must support:

- Unique ID
- Project ID
- Parent task ID, nullable
- Title
- Description/instructions
- Assigned employee
- Assigned functional job role
- Due date and time
- Priority
- Status
- Dependencies
- Approval required flag
- Designated approver
- Approval state/timestamp
- Optional SOP/reference URL
- Activity and audit history
- Created/updated timestamps
- Optional originating meeting reference

Subtasks inherit the client/project context from their parent.

Subtasks may have different assignees and deadlines from the parent.

## 7.2 Nesting

For Version 1:

- Only one subtask level beneath a parent task.
- No deeper nesting in the interface or creation API.
- Store `parentTaskId` so deeper nesting can be introduced in future without complete database redesign.

## 7.3 Task Statuses

Exactly these task statuses:

1. Blocked
2. To Do
3. In Progress
4. Awaiting Approval
5. Done
6. Cancelled

Use state-transition validation.

Normal flow:

Blocked → To Do → In Progress → Awaiting Approval → Done

Where approval is not required:

In Progress → Done

For revisions:

Awaiting Approval → In Progress

Revision requests must include a reason.

## 7.4 Status Rules

**Blocked**
- One or more prerequisites are incomplete.
- Cannot be started.
- Cannot be completed.

**To Do**
- Work is ready.
- Prerequisites are satisfied.
- Valid assignee is required before work is actionable.

**In Progress**
- Employee has begun work.
- Actual completion is not implied.

**Awaiting Approval**
- Employee has submitted completed work.
- Manager/approver must decide to approve or request revisions.

**Done**
- Work is complete.
- Required approval has been granted.

**Cancelled**
- Work is no longer active.
- Dependent tasks require explicit resolution.
- Cancelling a prerequisite must not silently unlock dependent work.

## 7.5 Parent and Subtask Rules

- A parent task can have multiple independently assigned subtasks.
- Subtasks have independent statuses.
- Subtasks have independent due dates.
- Parent progress is computed using completed non-cancelled leaf subtasks divided by total non-cancelled leaf subtasks.
- Avoid division-by-zero or misleading progress for a parent with no active subtasks.
- A parent cannot be Done until all its required subtasks are Done.
- If parent approval is required, the parent's approval must also be completed.
- Warn when a subtask deadline exceeds the parent deadline.
- Child assignment notifications must go to the child assignee.
- Do not notify everyone assigned to a parent task about unrelated child assignments.
- Adding a subtask to an already completed parent requires reopening or explicit Manager confirmation.
- Returning a task from Done to active status requires Manager/Admin authorization and a warning about downstream impact.

## 7.6 Overdue Behavior

Overdue must be calculated separately from task status.

Do not automatically change a task's status to Overdue.

A task can remain In Progress while having an Overdue flag.

Do not continue sending overdue reminders after the task becomes Done or Cancelled.

---

# 8. DEPENDENCY AND APPROVAL ENGINE

This is the core workflow automation feature.

## 8.1 Dependency Rules

A task or subtask may depend on other tasks/subtasks within the same project.

Support:

- Task-to-task dependencies.
- Subtask-to-subtask dependencies.
- Task-to-subtask dependencies where valid.
- Multiple prerequisites.
- Parallel work.

Rules:

1. Reject dependencies on oneself.
2. Reject circular dependencies.
3. Reject duplicate dependency edges.
4. Dependency endpoints must belong to the same project in MVP.
5. A dependent item becomes ready only when all active prerequisites are Done.
6. Submission for approval does not satisfy a dependency.
7. Approval of work requiring approval marks its prerequisite complete.
8. When a prerequisite becomes Done, reevaluate affected dependents.
9. Automatically transition eligible blocked work to To Do.
10. Notify the employee when their assigned work actually becomes actionable.
11. Prevent duplicate ready notifications.
12. Handle cancelled prerequisites through explicit Manager resolution.
13. Reopening completed prerequisites must identify downstream work already In Progress or Done and flag it for review rather than silently rewriting those records.

## 8.2 Example Workflow

A campaign requires:

- Campaign brief and competitor research.
- Video script.
- Video editing.
- Five Meta ad copies per ad.
- Campaign tracking/setup.
- Meta campaign launch.

Required behavior:

1. Performance Marketer completes campaign brief.
2. Scriptwriting becomes actionable.
3. Meta ad copywriting becomes actionable.
4. Campaign preparation/tracking becomes actionable.
5. Scriptwriting and ad copywriting may happen in parallel.
6. Video editing remains Blocked until the script is approved.
7. Script Writer submits work for approval.
8. Manager approves script.
9. Video Editing automatically becomes To Do.
10. Video Editor receives ready-to-start notification.
11. Editor completes video and submits for approval.
12. Manager approves edited video.
13. Campaign launch remains blocked until approved video assets, approved ad copies, and required setup tasks are all complete.
14. Performance Marketer can then launch the campaign.

## 8.3 Concurrency

Prevent:

- Two simultaneous approvals producing duplicate transitions.
- Duplicate task assignment events.
- Lost updates when two people edit a task.
- Duplicate template-generated tasks.
- Duplicate WhatsApp messages for one event.

Use transactional updates and optimistic concurrency/version checks where appropriate.

---

# 9. REUSABLE PROJECT TEMPLATES

The application must include an Admin-managed template system.

Templates contain:

- Template name
- Type
- Version
- Task definitions
- Subtask definitions
- Assigned functional roles
- Approval requirements
- Prerequisite/dependency relationships
- Relative due-date rules
- Optional descriptions and SOP links

Project generation must be idempotent and safe.

Generate the required tasks, subtasks, and dependencies consistently.

Use short MongoDB transactions where supported.

## 9.1 Template A — Destination Meta Ads Campaign

### Task 1: Campaign Brief & Competitor Research

Owner: Performance Marketer

Starts when the campaign project is created.

### Task 2: Produce Video Ad

Parent Task

Default owner: Creative Lead/Manager.

Note: Creative Lead is not currently a separately defined job role. Treat its exact mapping as a decision requiring clarification.

Subtask A: Write Video Ad Script

Owner: Video Ad Script Writer

Prerequisite: Campaign Brief Done

Approval required.

Subtask B: Edit Video Ad

Owner: Video Editor

Prerequisite: Video Ad Script Done and approved

Approval required.

### Task 3: Write 5 Meta Ad Copies per Ad

Owner: Performance Marketer

Prerequisite: Campaign Brief Done

Approval required according to the existing copywriting SOP.

### Task 4: Campaign Draft, Flow Tracking & Dataset Setup

Owner: Performance Marketer

Prerequisite: Campaign Brief Done

May proceed in parallel with scriptwriting/editing.

### Task 5: Launch Meta Campaign

Owner: Performance Marketer

Prerequisites:

- Required edited video assets approved.
- Ad copies approved.
- Campaign setup completed.

### Task 6: Weekly Campaign Review

Owner: Performance Marketer

Starts according to configured recurrence after campaign goes Live.

The exact recurrence scheduling policy requires finalization.

## 9.2 Multiple Video Ads

A campaign may require multiple video advertisements.

The Manager can duplicate the Produce Video Ad parent task.

Each duplicate contains its own:

- Scriptwriting subtask.
- Editing subtask.
- Approval flow.

Launch dependencies should reference the explicitly selected approved assets.

## 9.3 Additional Campaign Tasks

Include as needed:

- Create client ad account Custom Columns named **Interscale Marketing**.
- Complete client WhatsApp Business profile.

These can live in onboarding or a suitable campaign template variant.

Do not duplicate one-time technical setup tasks unnecessarily across every destination campaign.

## 9.4 Template B — Client Onboarding & Technical Setup

### Task 1: Collect Onboarding Requirements

Owner: Project Manager

Collect:

- Permissions
- Brand assets
- Client information
- Necessary access

### Task 2: Audit Business Presence & Existing Ads

Owner: Performance Marketer

Prerequisite: Required access available.

### Task 3: WhatsApp Business Profile & WhatsApp Max Flow

Owner: Performance Marketer

Prerequisite: Required WhatsApp access.

### Task 4: Meta Tracking, Dataset & Columns

Owner: Performance Marketer

Prerequisite: Required Meta account access.

### Task 5: Personalize Travel CRM

Owner: CRM/Data Executive

Prerequisite: CRM access and client information.

### Task 6: Enter Master Data & Package Information

Owner: CRM/Data Executive

Prerequisite: Travel CRM configured.

### Task 7: Validate All Key Setups

Owner: Project Manager

Prerequisite: Relevant setup tasks completed.

Important:

External access prerequisites must be represented consistently in the workflow engine.

Do not silently assume how manual access confirmations work. Identify the exact decision needed.

---

# 10. CLIENT MEETING MANAGEMENT

Meetings are independent records.

They are not stored as tasks.

Each meeting must support:

- Client ID
- Optional Project ID
- Subject/title
- Agenda
- Meeting start time
- Meeting end time
- Timezone
- Assigned Project Manager
- Optional internal attendees
- Optional meeting link/location
- Status
- Discussion notes
- Decisions taken
- Action items
- Links to generated tasks

Meeting statuses:

- Scheduled
- Completed
- Cancelled
- Rescheduled

## 10.1 Meeting Workflow

1. Project Manager schedules a client meeting.
2. Selects client and optionally a project.
3. Enters agenda and meeting date/time.
4. Assigned Project Manager receives a WhatsApp notification.
5. One hour before the meeting, send a reminder.
6. After the meeting, Project Manager records discussion notes and decisions.
7. Project Manager adds follow-up action items.
8. An action item includes title, responsible employee/role, and deadline.
9. Manager can select Create Task for an action item.
10. Confirm the destination project and assigned employee.
11. Create a real project task.
12. Link it back to the original meeting.
13. Standard task assignment and WhatsApp notification rules apply.

If a completed meeting has no notes, show a subtle in-app reminder.

Do not repeatedly send WhatsApp messages about missing meeting notes.

## 10.2 Meeting Views

Required:

- Meeting list.
- Meeting calendar.
- Client filter.
- Date filter.
- Meeting details.
- Agenda/notes.
- Action items.
- Related tasks.

Meetings must also appear alongside tasks in the Project Manager's daily schedule.

## 10.3 Rescheduling

On meeting reschedule:

- Update the meeting time.
- Cancel the previous scheduled reminder.
- Schedule a new reminder.
- Avoid duplicate notifications.

Display dates/times in Asia/Kolkata by default.

Store timestamps in UTC.

---

# 11. WHATSAPP NOTIFICATIONS

Use the official **Meta WhatsApp Business Platform Cloud API**.

Reuse the company's existing WhatsApp Max implementation only if it supports compliant outbound message templates.

Do not assume existing WhatsApp Max functionality is compatible without reviewing its implementation.

## 11.1 Notification Events

| Event | Recipient | Timing |
|---|---|---|
| Task assigned and ready | Assigned employee | Immediately |
| Blocked task becomes ready | Assigned employee | Immediately |
| Task reassigned | New assignee | Immediately |
| Revision requested | Assigned employee | Immediately |
| Task due soon | Assigned employee | 24 hours before deadline |
| Task overdue | Assigned employee | Once at/after deadline |
| Task overdue more than 24 hours | Client/project Manager | Once after 24 hours |
| Meeting assigned/rescheduled | Project Manager | Immediately |
| Meeting approaching | Project Manager | 1 hour before start |

## 11.2 Message Templates

Use approved WhatsApp templates with supported placeholders such as:

- employee_name
- client_name
- project_name
- task_title
- due_at_local
- priority
- task_url
- meeting_title
- start_at_local
- meeting_url

Never include account passwords, API secrets, or sensitive credentials in WhatsApp notification templates.

## 11.3 Opt-In and Compliance

Implement:

- Employee WhatsApp opt-in.
- Consent timestamp.
- Consent source.
- Opt-out support.
- Approved template messaging.
- Compliant official API usage.
- Delivery status tracking where available.

Template prices and categories can change.

Do not hardcode WhatsApp message pricing.

## 11.4 Reliability

Use:

- Persistent notification outbox.
- Delivery logs.
- Unique event/idempotency keys.
- Background dispatch.
- Retry with exponential backoff.
- Delivery-status webhooks.
- Verified webhook authentication.
- Provider message IDs.
- Admin-visible notification failures.

Important:

A WhatsApp API outage must never roll back a completed task update.

Task updates must commit independently from external message delivery.

Use event keys to ensure one notification per recipient, event type, entity, and applicable transition/version.

When a due date changes:

- Cancel or invalidate the old reminder.
- Schedule the correct new reminder.

Suppress inappropriate reminders for:

- Done work.
- Cancelled work.
- Blocked/non-actionable work.

Maintain an in-app notification fallback.

---

# 12. BACKGROUND WORKER

Use:

- Agenda v6
- @agendajs/mongo-backend
- Separate Node.js worker process
- MongoDB-backed persistent scheduled jobs

The worker must run continuously in production.

Responsibilities:

1. Task deadline scheduling.
2. Due-soon notifications.
3. Overdue alerts.
4. Manager escalations.
5. Meeting reminders.
6. Meeting reminder rescheduling/cancellation.
7. Notification retries.
8. Outbox event processing.

Reliability requirements:

- Persistent jobs.
- Unique events.
- Safe locking.
- Concurrency controls.
- Recovery after worker restart.
- Exponential backoff.
- Duplicate prevention.
- Correct stale reminder cancellation.

Do not rely on short-lived serverless functions for time-sensitive reminders.

Do not introduce Redis unless a later approved requirement justifies it.

---

# 13. REQUIRED APPLICATION SCREENS

The application must include these main sections.

## 13.1 Overview

For Admin and authorized Managers:

- Active clients.
- Open projects.
- Tasks due today.
- Overdue tasks.
- Pending approvals.
- Blocked tasks.
- Employee workload counts.
- Workload by role where useful.

## 13.2 My Tasks

For each employee:

- Today.
- Upcoming.
- In Progress.
- Awaiting Approval.
- Blocked.
- Overdue.
- Done.

Features:

- Client filters.
- Project filters.
- Task details.
- Subtasks.
- Due dates and priorities.
- Status updates.
- Submission for approval.
- Relevant revision feedback.

Count leaf subtasks separately from parent progress to avoid misleading double-counting.

## 13.3 Clients

- Client list.
- Client status.
- Client details.
- Assigned team members.
- Client-specific job-role mappings.
- Client's campaign projects.
- Client onboarding project.

## 13.4 Projects

- Project list.
- Project detail.
- Project status.
- Tasks and subtasks.
- Dependencies.
- Owners.
- Deadlines.
- Approval information.
- Project progress.

## 13.5 Meetings

- Meeting list.
- Calendar view.
- Agendas.
- Notes.
- Decisions.
- Action items.
- Create linked tasks.

## 13.6 Team

- Employee accounts.
- Department.
- Multiple job roles.
- Application access level.
- WhatsApp number.
- WhatsApp opt-in status.
- Assigned client teams.

## 13.7 Templates

Admin can:

- Create templates.
- View templates.
- Update templates.
- Manage tasks and subtasks.
- Configure assignments.
- Configure dependencies.
- Configure approval requirements.

## 13.8 Settings

- Workspace settings.
- WhatsApp integration configuration.
- Notification settings/logs.
- Relevant approved template mappings.

## 13.9 MVP Views

Required:

- List View across projects.
- Calendar View for meetings.

Do not build Gantt charts or Kanban boards in MVP.

---

# 14. DASHBOARDS AND WORKLOAD

## 14.1 Employee Dashboard

Show task counts for:

- To Do.
- In Progress.
- Awaiting Approval.
- Blocked.
- Today.
- Upcoming.
- Overdue.
- Done.

## 14.2 Project Manager Dashboard

Show:

- Assigned tasks.
- Today's client meetings.
- Upcoming meetings.
- Meeting notes pending.
- Client action items.
- Relevant follow-up tasks.

## 14.3 Owner/Manager Dashboard

Show:

- Active clients.
- Open projects.
- Overdue tasks.
- Pending approvals.
- Blocked work.
- Work due today.
- Workload by employee.
- Workload by functional job role.

## 14.4 Workload Definition

For MVP, workload means:

- Number of open actionable work items.
- Number of overdue work items.

Show blocked work separately.

Avoid double-counting parent tasks and their subtasks.

Do not add:

- Employee performance scoring.
- Sophisticated utilization analytics.
- Time-tracking charts.

---

# 15. FINAL TECHNOLOGY STACK — MANDATORY

This is the approved stack.

Do not substitute alternatives without explicit permission.

## 15.1 Architecture

- TypeScript monorepo.
- pnpm workspaces.
- Modular monolith.
- REST API.
- Separate background worker.
- Single agency workspace.
- Responsive web application.
- Shared TypeScript types.
- Shared Zod schemas.

## 15.2 Frontend

Core:

- React.
- TypeScript.
- Vite.
- React Router.

UI and styling:

- Tailwind CSS.
- shadcn/ui.
- Radix UI primitives.
- Lucide React.
- Sonner.

API data and tables:

- TanStack Query.
- TanStack Table.

Forms:

- React Hook Form.
- @hookform/resolvers.
- Zod.

Charts and calendar:

- Recharts through shadcn/ui charts.
- FullCalendar React.
- FullCalendar standard MIT-licensed plugins only.
- date-fns.
- date-fns-tz.

Additional rules:

- Use React's built-in state for local UI state.
- Use Zustand only when genuinely necessary.
- Make reusable accessible components.
- Support desktop and mobile screen widths.
- Include loading, empty, error, and success states.
- Use optimistic updates only when safe.

## 15.3 Backend

- Node.js LTS.
- TypeScript.
- Express 5.
- REST API under `/api/v1`.
- Mongoose ODM.
- Zod request validation.
- Shared schemas where appropriate.
- Centralized error handling.
- Pino.
- pino-http.
- Helmet.
- express-rate-limit.
- OpenAPI/Swagger.

Backend organization:

- Routes.
- Controllers.
- Services.
- Models.
- Authentication middleware.
- Authorization middleware.
- Validation middleware.

Business modules:

- Users.
- Departments.
- Job roles.
- Clients.
- Client role assignments.
- Projects.
- Tasks.
- Dependencies.
- Templates.
- Meetings.
- Notifications.
- Audit logs.

Keep business logic in services.

Do not put complex business rules directly in route handlers.

## 15.4 Database

Database: **MongoDB**

Initial environment: **MongoDB Atlas Free Tier**

Use:

- Mongoose for application-domain collections.
- MongoDB native driver integrations where required by supported Better Auth and Agenda adapters.

Database rules:

- Explicit document schemas.
- Schema validation.
- ObjectId references where applicable.
- Appropriate indexes.
- Unique indexes.
- Short transactions.
- Optimistic concurrency/version checks.
- Avoid oversized embedded documents.
- Application-level dependency graph validation.
- Replica-set-compatible transaction tests.
- Backup and restoration procedures.

MongoDB is the definitive database choice.

The original MVP PDF mentioned a relational database, but that decision has been replaced by this final approved MongoDB architecture.

Do not propose PostgreSQL or Prisma.

## 15.5 Authentication

- Better Auth.
- @better-auth/mongo-adapter.
- Better Auth Admin plugin.
- Email/password.
- Secure cookies.
- Server-side sessions.
- Disabled public signup.
- One-time Admin bootstrap.
- Admin-created employee accounts.
- Admin/Manager/Employee application access levels.
- Separate functional job roles.
- Client-scoped authorization.

## 15.6 Scheduling

- Agenda v6.
- @agendajs/mongo-backend.
- Separate persistent Node.js worker.
- MongoDB-backed jobs.

## 15.7 Testing

- Vitest for unit tests.
- Supertest for API integration tests.
- Playwright for end-to-end tests.
- MongoDB integration tests.
- ESLint.
- Prettier.
- TypeScript strict mode.
- GitHub Actions CI.

## 15.8 Development Tools

- pnpm.
- Git.
- GitHub.
- GitHub Actions.
- dotenv where appropriate.
- Zod environment validation.
- Environment-specific configuration.
- `.env.example` without secrets.
- Automated type checking.
- Consistent linting and formatting.

## 15.9 Deployment

Hosting: **AWS EC2**

No Docker.

No Docker Compose.

Frontend:

- Vite production build.
- Nginx static file serving.

Backend:

- Node.js running Express.
- Separate Node.js background worker.
- PM2 process management.
- PM2 restart on failure.
- PM2 startup on server reboot.

Networking:

- Nginx reverse proxy.
- HTTPS.
- Let's Encrypt.
- Certbot.
- Restricted inbound ports.
- Server-side secrets.

Operations:

- Application logs.
- Worker logs.
- Health checks.
- Monitoring.
- Error reporting.
- Database backups.
- Tested restoration.
- Optional GitHub Actions deployment.

## 15.10 File Storage

For MVP:

- Text descriptions.
- Reference URLs.
- External links for creative assets.

Do not add dedicated object storage.

Do not add Cloudflare R2 initially.

Do not build file upload or creative hosting functionality.

---

# 16. MONGODB DATA MODEL

Design collections that support the full application.

Required application-domain entities:

1. users / Better Auth identity integration
2. departments
3. jobRoles
4. userJobRoles or equivalent validated relationship
5. clients
6. clientRoleAssignments
7. projects
8. tasks
9. taskDependencies
10. taskActivity
11. templates
12. templateNodes
13. meetings
14. meetingActionItems
15. notificationOutbox
16. notificationLogs

Better Auth manages its authentication-related collections through its MongoDB adapter.

Do not create redundant identity records unnecessarily.

## 16.1 Users

Minimum application information:

- Unique user identifier.
- Name.
- Login email.
- WhatsApp-capable phone number in E.164 format.
- Application access level.
- Active/account status.
- WhatsApp consent timestamp and source.
- Job-role associations.
- Created/updated timestamps.

Preserve functional role assignments independently from authentication-library internal roles.

Do not assume users can belong to only one department if their multiple job roles span departments.

## 16.2 Clients

Minimum:

- ID.
- Name.
- Status.
- Assigned/primary Manager where appropriate.
- Created/updated timestamps.

## 16.3 Client Role Assignments

Minimum:

- Client ID.
- Functional job role ID.
- Employee/user ID.
- Active status.

Enforce uniqueness for active primary designated assignments by client and role.

## 16.4 Projects

Minimum:

- ID.
- Client ID.
- Name.
- Type.
- Status.
- Manager ID.
- Start date/time.
- Target date/time.
- Template reference.

## 16.5 Tasks

Minimum:

- ID.
- Project ID.
- Nullable parentTaskId.
- Title.
- Description.
- Status.
- Priority.
- Assignee ID.
- Assigned role ID.
- Due timestamp.
- Approval requirement.
- Approver ID.
- Approval timestamp.
- SOP/reference URL.
- Optional sourceMeetingId.
- Created/updated timestamps.
- Concurrency/version field where appropriate.

## 16.6 Task Dependencies

Minimum:

- Predecessor task ID.
- Successor task ID.

Constraints:

- Unique edges.
- Same-project endpoints.
- No self-reference.
- No cycles.

## 16.7 Task Activity

Capture:

- Task ID.
- Actor ID.
- Action.
- Previous value.
- New value.
- Timestamp.
- Notes.

## 16.8 Templates

Represent:

- Template type.
- Version.
- Parent/child nodes.
- Assigned functional roles.
- Relative deadlines.
- Approval rules.
- Dependencies.

## 16.9 Meetings

Represent:

- Client.
- Optional project.
- Owner.
- Title.
- Agenda.
- Notes.
- Decisions.
- Start/end timestamps.
- Meeting URL/location.
- Status.

## 16.10 Meeting Action Items

Represent:

- Meeting ID.
- Description/title.
- Assigned owner/role.
- Due timestamp.
- Optional linked task ID.

## 16.11 Notifications

Outbox/log information:

- Entity reference.
- Event type.
- Event/idempotency key.
- Recipient.
- Approved template name.
- Scheduled time.
- Status.
- Provider message ID.
- Attempts.
- Error details.

All operational records should include appropriate creation/update timestamps and indexes.

Protect records from cross-client references that violate the project hierarchy.

---

# 17. REST API REQUIREMENTS

Use REST under:

`/api/v1`

Better Auth authentication routes may use their required authentication prefix.

Core operations must include:

### Clients
- Create client.
- List permitted clients.
- View client.
- Update client.
- Configure designated client role assignments.

### Projects
- Create project from template.
- List projects.
- View project.
- Update project.
- List project tasks.

### Tasks
- Create task.
- Create subtask.
- Update task.
- Change task status through validated transition.
- Submit for approval.
- Approve.
- Request revision.
- Manage dependencies.
- Reassign task.
- Read activity history.

### Templates
- Create/update templates.
- List templates.
- Instantiate projects from templates.

### Meetings
- Create meeting.
- Update meeting.
- Reschedule meeting.
- Complete meeting.
- Record notes and decisions.
- Create action items.
- Convert action items to tasks.

### Notifications
- View notification status.
- View permitted notification logs.
- Process verified WhatsApp delivery webhooks.

### Users
- Admin creates employee.
- Admin updates employee.
- Manage access level.
- Manage functional job roles.
- Manage client assignments.
- Deactivate/reactivate where authorized.

Important:

- Validate inputs with Zod.
- Enforce authorization server-side.
- Use consistent error responses.
- Include request IDs in logs/errors.
- Use idempotency keys on operations where duplicate execution would create duplicate work.
- Enforce valid state transitions in services.
- Document APIs using OpenAPI/Swagger.

---

# 18. SECURITY, AUDITING, AND RELIABILITY

Mandatory:

- HTTPS.
- Secure password hashing.
- Protected sessions.
- Server-side permissions.
- Client and project isolation.
- Safe input validation.
- NoSQL injection resistance.
- Appropriate indexes.
- Concurrency protection.
- Safe transaction handling.
- Credential redaction.
- Rate limiting.
- Secure WhatsApp webhook validation.
- Protected environment variables.
- Database backups and restore tests.

Audit changes to:

- Task assignment.
- Task status.
- Task due date.
- Approvals.
- Revisions.
- Dependencies.
- Meeting schedule.
- Client team assignments.
- Employee permissions.

Never expose WhatsApp API tokens in the browser.

Never persist plaintext passwords in application activity logs.

Show clear errors for:

- Missing client-role mapping.
- Invalid due date.
- Circular dependency.
- Unauthorized operation.
- Concurrent modification.
- Failed WhatsApp delivery.

A user must receive a clear error instead of an unexplained failure.

---

# 19. TESTING AND ACCEPTANCE CRITERIA

The application is not complete merely because the pages render.

It must pass functional and security tests.

## 19.1 Authentication Tests

- Initial Admin account is created securely.
- Bootstrap cannot overwrite an existing Admin password.
- Email/password login succeeds with valid credentials.
- Invalid credentials are rejected.
- Public signup is disabled.
- Non-Admin users cannot create employee accounts.
- Unauthorized access to admin functionality is rejected.
- Deactivated users cannot continue accessing protected resources.
- Sessions are invalidated appropriately.
- Application access levels remain separate from functional roles.

## 19.2 Client/Role Tests

- Create 20 clients with multiple projects each.
- Client/project filters do not mix data.
- Two clients may have different Video Editors.
- Two clients may have different Performance Marketers.
- A single employee can hold multiple functional job roles.
- A single employee can work for several clients.
- A missing client-role assignment is identified.
- No arbitrary automatic assignment occurs.
- Users cannot access unauthorized client/project information.

## 19.3 Task/Subtask Tests

- A parent can contain multiple real subtasks.
- Subtasks may have different assignees.
- Subtasks may have different due dates.
- Subtasks appear in the correct employee's My Tasks.
- Parent completion requires all required subtasks.
- Parent progress is calculated correctly.
- Blocked tasks cannot start or complete.
- Status transitions are validated.
- Revisions return work to In Progress with a reason.

## 19.4 Dependency Tests

- Approving a script unlocks video editing.
- Submitting a script without approval does not unlock editing.
- Parallel copywriting and video work can proceed.
- Campaign launch waits for all prerequisites.
- Multiple prerequisites must all be satisfied.
- Self-dependencies are rejected.
- Circular dependencies are rejected.
- Duplicate dependencies are rejected.
- Reopening prerequisite work flags affected downstream items.
- Cancelled dependencies require deliberate handling.

## 19.5 Notification Tests

- Ready work notifies the correct employee.
- Reassignment notifies only the new assignee as appropriate.
- Blocked work does not receive misleading ready notifications.
- Due-time changes invalidate old reminders.
- Overdue notifications are sent only as configured.
- Done/Cancelled tasks suppress stale reminders.
- Duplicate events do not send duplicate WhatsApp notifications.
- WhatsApp API outages do not roll back task state changes.
- Failed messages are logged and retried safely.
- Background worker restart recovers pending work.

## 19.6 Meeting Tests

- Meetings can be scheduled.
- Reminders trigger one hour before.
- Rescheduling replaces old reminders.
- Cancellation suppresses reminders.
- Notes and decisions persist.
- Action items can create linked tasks.
- Project Manager sees meetings alongside assigned tasks.

## 19.7 Security Tests

- Changing URL IDs cannot expose unauthorized records.
- Employees cannot escalate their access level.
- Managers remain restricted to their assigned scope.
- Unauthorized API calls are rejected even if frontend checks are bypassed.
- Audit history records required changes.
- Sensitive credentials do not appear in logs.

## 19.8 Mobile Tests

- Login works on phone-width layouts.
- My Tasks works on mobile.
- WhatsApp task links open relevant pages.
- Navigation remains usable on smaller displays.
- Error/loading/empty states work correctly.

## 19.9 Quality Gates

Require:

- TypeScript strict compilation.
- ESLint.
- Prettier.
- Unit tests.
- API integration tests.
- End-to-end tests where appropriate.
- Production builds.
- CI checks.

---

# 20. DEVELOPMENT PHASES

Follow this order.

## Phase 1 — Foundation and Authentication

Build:

- Monorepo structure.
- Frontend/backend foundation.
- Shared schemas.
- MongoDB connection.
- Better Auth.
- Secure initial Admin bootstrap.
- Login/logout.
- Employee management.
- Access levels.
- Departments.
- Functional job roles.
- Client management.
- Client-role assignments.
- Server-side permission enforcement.
- Basic application navigation.

Acceptance:

Employees see only their permitted client data and management actions.

## Phase 2 — Core Project and Task Engine

Build:

- Projects.
- Tasks.
- Subtasks.
- Task statuses.
- Due dates.
- Priorities.
- Approvals.
- Revisions.
- My Tasks.

Acceptance:

Parent tasks contain independently assigned and controlled subtasks.

## Phase 3 — Dependencies and Automatic Assignment

Build:

- Dependency graph.
- Cycle detection.
- Role assignment resolution.
- Automatic task unlocking.
- Event/audit history.
- Downstream review warnings.

Acceptance:

Approving a Video Ad Script makes the correct Video Editor subtask actionable.

## Phase 4 — Templates

Build:

- Campaign template.
- Client onboarding template.
- Task graph generation.
- Template versioning/configuration.
- Automatic client-specific assignments.

Acceptance:

Creating a Singapore or Goa campaign produces the correct tasks, subtasks, assignments, and prerequisites.

## Phase 5 — WhatsApp Notifications

Build:

- Meta WhatsApp Cloud API integration.
- Approved templates.
- Agenda worker.
- Persistent outbox.
- Due reminders.
- Overdue alerts.
- Escalations.
- Delivery logs.
- Retry handling.

Acceptance:

Employees receive the correct notifications and retries do not produce duplicate messages.

## Phase 6 — Meetings

Build:

- Meeting list/calendar.
- Meeting scheduling.
- Agendas.
- Notes/decisions.
- Action items.
- Convert action items to tasks.
- Meeting reminders.

Acceptance:

A completed meeting can generate linked follow-up tasks and all reminders behave correctly.

## Phase 7 — Overview, Hardening, QA and Deployment

Build/finalize:

- Owner/Manager overview.
- Employee workload dashboards.
- Project Manager daily view.
- Full security review.
- Backup/restore procedures.
- End-to-end UAT.
- AWS EC2 deployment.
- Nginx.
- PM2.
- HTTPS.

Acceptance:

All defined MVP acceptance criteria pass.

---

# 21. EXPLICITLY OUT OF SCOPE FOR MVP

Do not build:

- Social media content calendar.
- Social media publishing.
- Automated Instagram/Facebook posting.
- Recurring social media Reel/Static Post scheduling.
- Internal team chat.
- AI assistant or AI automation.
- Gantt charts.
- Kanban boards.
- Time tracking.
- Attendance.
- Payroll.
- Employee scoring.
- Native Android app.
- Native iOS app.
- Complex visual workflow builder.
- CRM lead data synchronization.
- Client portal.
- Billing/invoicing.
- Creative file hosting.
- Video proofing.
- Dedicated object storage.

Also prohibited without approval:

- Docker.
- Docker Compose.
- Prisma.
- PostgreSQL.
- Unnecessary Redis.
- Unapproved SaaS services.
- Switching the approved tech stack.

---

# 22. UNRESOLVED REQUIREMENTS — DO NOT INVENT DECISIONS

The following require clarification before their related functionality is implemented.

1. Exact default owner for the Creative Lead/Manager parent video task.
2. Relative deadlines for campaign and onboarding template tasks.
3. How external access prerequisites are confirmed.
4. Exact recurrence rules for weekly campaign reviews.
5. Representation of Needs Assignment without introducing an unauthorized seventh task status.
6. Conditions under which authorized Managers may edit client information or team mappings.
7. Whether departments and functional roles are editable or managed as seeded reference data.
8. Precise employee invitation/password-delivery workflow.
9. Any additional approval exceptions.
10. Detailed audit retention rules.

Also validate technical integration decisions rather than guessing:

- Better Auth MongoDB adapter and identity ID behavior.
- Better Auth Admin plugin endpoint protection.
- Supported version-specific Better Auth APIs.
- Agenda v6 Mongo backend configuration.
- MongoDB transaction behavior.
- Cookie/CSRF protection.

Do not silently modify business rules to resolve ambiguities.

Propose reasonable defaults and obtain approval where the choice materially changes functionality, security, or the data model.

---

# 23. IMPORTANT CORRECTIONS TO THE PREVIOUS OPENCODE PLAN

A previous Phase 1 plan was generated without access to the original requirements.

Do not treat that plan as authoritative when it conflicts with this specification.

Correct these areas:

### A. Client Assignments

The database must support a designated employee per client and job role, not merely arbitrary client membership.

### B. Manager Permissions

Follow the specified conditional, client-scoped Manager permissions rather than assuming all client changes are permanently Admin-only.

### C. Employee Access

An employee assigned to a client must not automatically see all unrelated private work for that client.

### D. Multi-Role Employees

Do not restrict employees to a single functional job role or assume all their roles must belong to one department.

### E. Better Auth

Keep Better Auth internal administrative permissions separate from the application's Admin/Manager/Employee access levels.

Do not assume Better Auth admin HTTP endpoints are inaccessible without implementing and testing appropriate protections.

### F. Identity Design

Avoid duplicate user identity systems.

Verify the actual MongoDB adapter behavior before selecting any custom ID strategy.

### G. Documentation

This prompt contains the requirements.

Do not claim the requirements are unavailable merely because separate PDFs or Markdown documents are not currently inside the repository.

Once implementation is approved, preserve this specification in maintainable repository documentation.

Create or update `AGENTS.md` so future OpenCode sessions follow the same technology, architecture, coding, and business rules.

---

# 24. CODE QUALITY AND DEVELOPMENT PRACTICES

Follow these rules throughout development:

1. Use TypeScript strict mode.
2. Write maintainable, modular code.
3. Keep API controllers thin.
4. Keep business logic in services.
5. Use Zod at data boundaries.
6. Avoid unnecessary dependencies.
7. Do not invent library APIs.
8. Verify installed versions.
9. Use robust error handling.
10. Implement authorization on the server.
11. Avoid unnecessarily complicated abstractions.
12. Document meaningful architecture decisions.
13. Add tests for critical business logic.
14. Keep secrets out of source control.
15. Write understandable code and clear naming.
16. Prefer simple solutions over unnecessary architectural complexity.
17. Keep implementation within approved MVP scope.
18. Implement one testable feature at a time.
19. Do not skip failed tests.
20. Do not call a feature complete until acceptance criteria pass.

---

# 25. YOUR CURRENT ASSIGNMENT — REVISE THE PHASE 1 PLAN

You have the complete application requirements above.

Your current task is **PLANNING ONLY**.

Do not install packages.

Do not modify files.

Do not scaffold the application.

Do not begin writing code.

Produce a revised, detailed Phase 1 plan that accounts for the entire system's future requirements.

Your response must cover:

## 25.1 Architecture

Explain the exact TypeScript monorepo architecture.

Include proposed structure for:

- apps/web
- apps/api
- apps/worker
- packages/shared
- Shared database infrastructure
- Testing
- Documentation
- Configuration
- Deployment-related configuration

## 25.2 Authentication

Design:

- Better Auth configuration.
- MongoDB integration.
- Initial Admin bootstrap.
- Login/logout/session handling.
- Disabled public signup.
- Admin-created employee accounts.
- Temporary password setup.
- Session revocation.
- Account activation/deactivation.
- Security controls.

## 25.3 Authorization

Design:

- Admin permissions.
- Manager permissions.
- Employee permissions.
- Functional job roles.
- Client scoping.
- Client-specific primary role assignments.
- Future project/task-level access enforcement.
- Separation from Better Auth internal permissions.

Include an exact permission matrix.

## 25.4 MongoDB

Design Phase 1 collections and indexes.

Make sure these decisions will support later:

- Task dependencies.
- Workflow approvals.
- Multi-client assignments.
- Templates.
- Meetings.
- Audit logs.
- Notification outbox.

Do not implement later modules yet.

## 25.5 API

List Phase 1 endpoints.

Include:

- Request validation.
- Required permissions.
- Response conventions.
- Errors.
- Authentication handling.

## 25.6 Frontend

Plan:

- Login page.
- Forced password change.
- Admin dashboard foundation.
- Employees page.
- Employee create/edit.
- Departments and functional roles.
- Client list/details.
- Client role assignments.
- My profile.
- Unauthorized/404 pages.
- Responsive sidebar/navigation.

Do not implement future-phase functionality prematurely.

## 25.7 Testing

List Phase 1 security and functional tests.

Include:

- Public signup disabled.
- Initial Admin bootstrap.
- Admin-only user creation.
- Role enforcement.
- Client access isolation.
- Manager-scoped permissions.
- Multi-role employees.
- IDOR prevention.
- Session revocation.
- Concurrent updates.
- Mobile login.

## 25.8 Implementation Order

Break Phase 1 into small implementation steps.

Each step must include:

- Objective.
- Files/modules expected.
- Required functionality.
- Tests.
- Acceptance criteria.
- Dependencies on previous steps.

## 25.9 Open Questions

Ask only questions that genuinely require a business decision before Phase 1 can be implemented safely.

Do not repeatedly ask about decisions already explicitly finalized in this prompt.

## 25.10 Final Output

Return:

1. Architecture summary.
2. Complete folder structure.
3. Phase 1 MongoDB schema plan.
4. Authentication design.
5. Authorization design and permission matrix.
6. API design.
7. Frontend screen plan.
8. Development checklist.
9. Testing checklist.
10. Remaining decisions requiring approval.

**STOP AFTER PRESENTING THE PLAN.**

Wait for my approval before writing any code.

Do not lose or reinterpret the requirements above in later phases.

The objective is to build the exact internal Project & Team Management System specified here, using my finalized tech stack and my updated authentication requirements.
