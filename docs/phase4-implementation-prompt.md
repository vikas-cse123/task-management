# INTERSCALE MARKETING — PHASE 4 COMPLETE IMPLEMENTATION
## Steps 19–24 | Reusable Project Templates, Campaign Automation, Client Onboarding & One-Click Project Generation

# 0. YOUR ROLE AND PRIMARY OBJECTIVE

Act as a Principal Software Architect, Senior Full-Stack TypeScript Engineer, MongoDB Database Architect, Workflow Automation Architect, Security Engineer, UI/UX Engineer, and QA Lead.

You are developing **Interscale Marketing's internal Project & Team Management System**.

Project directory:

C:\Users\User\Desktop\vikas\project-management

Git Bash equivalent:

/c/Users/User/Desktop/vikas/project-management

## CURRENT DEVELOPMENT STATUS

The following phases have been completed according to prior OpenCode reports:

- Phase 1 — Foundation, Authentication, Employee Management, Client Management, Permissions.
- Phase 2 — Projects, Tasks, Subtasks, Statuses, Approvals, My Tasks, Dashboards.
- Phase 3 — Task Dependencies, Automatic Workflow Progression, Client-Specific Assignment, Downstream Review.

The Phase 3 completion report states:

- 185 unit/integration tests passed.
- 54 Playwright E2E tests passed.
- Dependency engine implemented.
- Automatic task unlocking implemented.
- Client-specific designated employee resolution implemented.
- Durable workflow readiness events implemented.
- Manual and dependency blocking distinguished.
- Reopening and downstream review supported.
- Phase 3 template integration hooks prepared.

These are reported results, not independently verified facts. Inspect the actual repository.

## YOUR ASSIGNMENT

Implement the COMPLETE Phase 4, including:

**Step 19 — Template Database, Versioning & Validation**

**Step 20 — Destination Meta Ads Campaign Template**

**Step 21 — Client Onboarding & Technical Setup Template**

**Step 22 — Atomic Project Generation & Automatic Assignment**

**Step 23 — Template Management, Project Creation UI & Workflow Integration**

**Step 24 — Complete Security Audit, Unit/Integration Tests, Playwright E2E & Documentation**

Execute every step sequentially in ONE continuous development workflow.

Do not request approval between steps.

After each step:

1. Run relevant tests.
2. Run typecheck.
3. Verify authorization.
4. Fix failures.
5. Continue automatically.

Stop only if an essential unresolved decision blocks safe development.

**Do not begin Phase 5, Phase 6, or Phase 7.**

After Step 24, provide one consolidated Phase 4 completion report and stop.

The expected result is a REAL, secure, tested, reusable template system—not placeholder screens or hardcoded project creation scripts.

---

# 1. READ ALL EXISTING DOCUMENTATION FIRST

Before modifying anything, read:

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
- Relevant Architecture Decision Records

Inspect existing:

- Project models and services.
- Task models and services.
- Subtask implementation.
- Approval state machine.
- Dependency graph services.
- Automatic task readiness logic.
- Auto-assignment resolver.
- Client-role assignment records.
- Workflow events.
- Audit services.
- Existing frontend pages.
- Existing unit/integration tests.
- Existing Playwright E2E setup.

**Reuse existing implementations.**

Do not create a second task management system, separate approval engine, independent dependency implementation, or duplicate MongoDB user models.

## REQUIREMENTS PRIORITY

Follow:

1. Final approved technology stack.
2. Updated authentication and authorization decisions.
3. Previously approved architecture and Phase 1–3 business rules.
4. Original MVP v1.1 requirements.
5. This Phase 4 implementation specification.

Preserve the original requirements document.

If a genuine conflict exists, document it and ask only if the conflict cannot be resolved without materially changing approved behavior.

---

# 2. BUSINESS CONTEXT

Interscale Marketing specializes in performance marketing for B2C travel agencies.

Examples of our clients:

- Travel Enfield.
- Other travel agencies selling Singapore, Kashmir, Bali, Vietnam, Dubai, and domestic/international tour packages.

For every new client, we perform onboarding and technical setup.

For every new destination campaign, we perform a repeatable sequence of advertising tasks.

Currently, after Phase 3, these tasks can be manually created and connected with dependencies.

**Phase 4 must eliminate repetitive manual project creation.**

## EXAMPLE

Admin or authorized Project Manager:

1. Opens a client.
2. Clicks Create Project.
3. Selects a template.
4. Selects a destination.
5. Sets project dates and required options.
6. Reviews assignments and deadlines.
7. Clicks Create Project.

The system must create:

- Project.
- Parent tasks.
- Real subtasks.
- Correct job-role requirements.
- Eligible client-specific assignees.
- Approval requirements.
- Designated approvers.
- Prerequisite/dependency relationships.
- Initial blocked/ready states.
- Relative deadlines.
- Audit history.

All within a safe, idempotent creation workflow.

## DEPARTMENTS AND JOB ROLES

### Creative Production

- Video Ad Script Writer.
- Video Editor.
- Graphic Designer.

### Performance Marketing

- Performance Marketer.

### CRM & Data Operations

- CRM/Data Executive.

### Project Management

- Project Manager.

An employee may hold multiple functional job roles.

Application access levels remain exactly:

- Admin.
- Manager.
- Employee.

Job roles never automatically grant application access levels.

---

# 3. APPROVED TECHNOLOGY STACK

Use existing approved technologies.

## Architecture

- TypeScript modular monolith.
- pnpm workspaces.
- Express 5 REST API.
- React/Vite frontend.
- MongoDB/Mongoose.
- Shared Zod contracts.
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
- date-fns.
- date-fns-tz.

## Backend

- Node.js LTS.
- Express 5.
- Mongoose.
- MongoDB.
- Pino/pino-http.
- Helmet.
- express-rate-limit.
- OpenAPI/Swagger.

## Authentication

- Better Auth.
- @better-auth/mongo-adapter.
- Better Auth Admin plugin.
- Existing server-side authorization.

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
- Let's Encrypt/Certbot.

## PROHIBITED

Do not introduce:

- Docker.
- Docker Compose.
- Prisma.
- PostgreSQL.
- Redis.
- Another authentication provider.
- Another task engine.
- Unapproved SaaS integrations.
- Dedicated creative file storage.

---

# 4. PRE-IMPLEMENTATION VERIFICATION AND CORRECTIONS

Before Step 19, complete this preparation.

## 4.1 Git Safety

Inspect:

- Current branch.
- Git status.
- Existing commits.
- Tracked credentials.
- Ignored environment files.
- Working tree changes.

The Phase 3 report states that Phase 2 and Phase 3 changes remain uncommitted.

Preserve that work.

If the repository's standing rules permit local commits, create a reviewed, secret-free checkpoint before starting Phase 4.

If the rules require explicit permission for commits, do not override them. Report the limitation instead.

Never push or modify Git remotes without authorization.

## 4.2 Verify Existing Tests

Run the existing Phase 1–3 regression tests.

Reconcile this discrepancy from Phase 3's report:

- 34 previously existing E2E tests.
- 30 newly described Phase 3 scenarios.
- 54 reported total passing tests.

Determine the true number of executed Playwright tests versus named scenarios, overlapping tests, or grouped assertions.

Record the actual result.

Do not invent test counts.

## 4.3 Correct Automatic Assignment Fallback

Inspect the Phase 3 resolver.

The approved assignment precedence is:

1. Valid explicit template employee override.
2. Valid client-designated primary employee for the required job role.
3. Manual selection by Admin/authorized Manager when unresolved.

**A Project Manager is NOT an automatic fallback assignee for Video Editing, Scriptwriting, Ad Copywriting, CRM Setup, or any unrelated job role.**

If the resolver currently substitutes the Project Manager automatically, correct it.

A Project Manager may be assigned only when:

- The task specifically requires the Project Manager job role, OR
- An explicitly chosen employee is independently eligible for the required role and assignment.

Otherwise:

- Leave the task unassigned.
- Display Needs Assignment.
- Require authorized manual resolution.

Test this behavior before introducing template generation.

## 4.4 Preserve Existing Behavior

Verify:

- Authentication still works.
- Client management still works.
- Project management still works.
- Manual task creation still works.
- Approval and revision workflows still work.
- Dependency blocking/unlocking still works.
- Manual assignees are preserved.
- No cross-client access exists.

Do not start Step 19 from a broken baseline.

---

# STEP 19 — TEMPLATE DATABASE, VERSIONING AND VALIDATION

## 19.1 Objective

Build an Admin-managed reusable project template system.

Templates must define entire project workflows without binding them to one particular client.

Template definitions should be reusable for:

- Singapore Campaign.
- Kashmir Campaign.
- Bali Campaign.
- Dubai Campaign.
- Vietnam Campaign.
- Client Onboarding.
- General future workflows.

Template creation and editing are Admin-only.

Managers may instantiate approved templates within their authorized client scope.

Employees may not modify template definitions or create projects from templates.

## 19.2 Template Types

Support:

1. Campaign.
2. Onboarding.
3. General.

Templates must define the resulting Project type.

## 19.3 Template Model

Create an application-domain collection/model such as:

`templates`

Suggested fields:

- _id
- key
- name
- description
- type
- status
- currentPublishedVersion
- createdBy
- updatedBy
- createdAt
- updatedAt

Recommended statuses:

- Draft.
- Published.
- Archived.

Use stable internal keys.

Do not depend on editable display names for template identity.

## 19.4 Template Versioning

A template can change over time.

Example:

Campaign Template v1:

- Brief.
- Scriptwriting.
- Editing.
- Copies.
- Tracking.
- Launch.

Later Campaign Template v2:

Adds a new required validation task.

Existing projects created from v1 must NOT silently change.

Requirements:

1. Published template versions are immutable.
2. Admin edits produce or update a draft.
3. Publishing produces an identifiable version.
4. New projects use the selected published version, normally the current version.
5. Existing generated projects preserve their creation-time template version.
6. Template changes never automatically rewrite existing project tasks.
7. Archived versions remain available for historical reference.
8. Do not permit invalid template versions to be published.

You may design template/version documents as separate collections or as a safe versioned model.

Choose the simplest maintainable approach compatible with the approved schema.

Document your versioning strategy.

## 19.5 Template Node Model

Create reusable task definitions.

Use:

`templateNodes`

Each node represents a future Task or Subtask.

Suggested fields:

- _id
- templateId
- templateVersion or templateVersionId
- nodeKey
- parentNodeKey
- titleTemplate
- descriptionTemplate
- requiredJobRoleKey
- priority
- approvalRequired
- approverResolutionRule
- relativeDueRule
- isRequired
- assignmentRule
- sortOrder
- sopUrl
- referenceUrl
- createdAt
- updatedAt

Use stable node keys.

Node keys must be unique within a template version.

One level of subtasks only.

Use existing task status and priority conventions.

Do not create separate Task/TemplateTask workflow engines.

Template nodes are DEFINITIONS, not executable tasks.

## 19.6 Template Dependencies

Represent prerequisite relationships between template nodes.

Example:

`video_editing` depends on `video_script`.

Do not store live Task IDs inside template definitions.

Store version-scoped node references.

During instantiation, map those references to newly created real Task IDs.

Required validation:

- Node exists.
- Same template version.
- No self-reference.
- No duplicate edges.
- No circular dependencies.
- No impossible parent/subtask completion cycle.
- No references to removed nodes.
- No deeper-than-one-level subtasks.

Reuse the Phase 3 graph validation logic where possible.

## 19.7 Template Variables

Support practical variables such as:

- clientName
- destination
- campaignName
- projectName
- projectStartDate
- projectTargetDate

Example:

Template title:

"Write {{destination}} Video Ad Script"

Destination:

Singapore

Generated Task:

"Write Singapore Video Ad Script"

Validate variables strictly.

Prevent unknown placeholders or malformed substitutions from creating broken task titles.

Avoid arbitrary executable template expressions.

Do not use eval or user-supplied executable code.

## 19.8 Deadline Rules

Support configurable relative deadlines.

Recommended model:

- Offset from project start date.
- Offset from project target date where appropriate.
- Relative due time.
- Timezone-aware calculation.
- Optional explicit override during creation.

Keep offsets configurable.

Do not invent company-specific task turnaround deadlines that the user has not approved.

Use Asia/Kolkata as the default display timezone.

Store timestamps in UTC.

If working-day calculations are not explicitly required, use a clearly documented calendar-day rule rather than silently introducing weekend/holiday assumptions.

## 19.9 Template Validation

Before publishing:

Validate:

- Template name/type.
- Unique node keys.
- Valid roles.
- Valid priorities.
- Parent-child structure.
- Valid approval rules.
- Valid dependency graph.
- Required variables.
- Valid relative deadlines.
- Valid assignment rules.
- No unreachable or inconsistent workflow states.
- No impossible parent completion cycle.

Return useful validation errors.

Do not publish invalid templates.

## 19.10 Template APIs

Implement appropriate routes under `/api/v1`:

- GET /templates
- POST /templates
- GET /templates/:id
- PATCH /templates/:id
- GET /templates/:id/versions
- GET /templates/:id/versions/:version
- POST /templates/:id/validate
- POST /templates/:id/publish
- POST /templates/:id/archive

Also implement node and dependency editing through appropriately designed endpoints.

Use existing API conventions.

Admin-only template mutation.

Authorized Managers may list/read published templates for project creation.

Employees cannot access sensitive template administration capabilities.

## 19.11 Step 19 Tests

Test:

- Template creation.
- Admin-only editing.
- Version creation.
- Published version immutability.
- Draft editing.
- Template archiving.
- Node validation.
- One-level subtasks.
- Invalid role rejection.
- Invalid variable rejection.
- Duplicate node rejection.
- Circular dependency rejection.
- Parent-child impossible cycle rejection.
- Cross-version dependency rejection.
- Concurrent publish.
- Unauthorized access.

Run all relevant tests before Step 20.

---

# STEP 20 — DESTINATION META ADS CAMPAIGN TEMPLATE

## 20.1 Objective

Create the official reusable:

**Destination Meta Ads Campaign Template**

This is a core Interscale Marketing workflow.

It must be seeded as a reusable Admin-managed template.

It should generate real project tasks for any selected destination.

Example destinations:

- Singapore.
- Kashmir.
- Bali.
- Dubai.
- Vietnam.
- Goa.

The template must not be hardcoded only for Singapore.

## 20.2 Campaign Creation Inputs

Required:

- Client.
- Destination.
- Campaign/project name.
- Project start date.
- Assigned Project Manager or valid designated Manager resolution.
- Approval configuration.

Optional, where appropriate:

- Project target date.
- Number of video advertisements.
- Required creative types.
- Specific employee overrides.
- Deadline overrides.
- SOP/reference URLs.

Keep the wizard simple.

Do not require unnecessary inputs.

## 20.3 Campaign Workflow

Implement the following template structure.

### TASK 1 — Campaign Brief & Competitor Research

Required job role:

Performance Marketer.

Responsibilities:

- Review client offer.
- Review target destination.
- Research competitor travel agency advertisements.
- Review positioning.
- Identify the intended traveller audience.
- Identify offer and creative direction.
- Prepare the campaign brief.

This task is the initial prerequisite for downstream campaign production.

Default approval requirement must follow the configured template rule.

Do not invent an approval requirement where not specified.

### TASK 2 — Produce Destination Video Ad

Parent Task.

Example:

"Produce Singapore Video Ad"

This is a coordination container with real subtasks.

#### SUBTASK 2A — Write Video Ad Script

Role:

Video Ad Script Writer.

Prerequisite:

Campaign Brief Done.

Approval required.

Employee responsibilities:

- Write video advertising script.
- Submit script through existing external review workflow.
- Mark Submit for Approval inside the app.
- Revise if requested.

#### SUBTASK 2B — Edit Video Ad

Role:

Video Editor.

Prerequisite:

Video Ad Script Done and approved.

Approval required.

Employee responsibilities:

- Edit advertising video.
- Submit through external WhatsApp review process.
- Mark Submit for Approval in the app.
- Revise if requested.

Important:

Actual video files remain outside this software.

Do not implement uploading or video hosting.

### TASK 3 — Write 5 Meta Ad Copies Per Ad

Role:

Performance Marketer.

Prerequisite:

Campaign Brief Done.

Approval required.

This task must clearly specify five advertising copies for EACH advertisement in the campaign.

Use the existing Interscale Marketing ad copywriting SOP.

Opening sentence requires:

- Right audience.
- Destination.
- Destination-decided/high-intent traveller.

Include an SOP link/description field.

Do not implement AI copywriting or AI copy evaluation.

### TASK 4 — Campaign Setup, Flow Tracking & Dataset

Role:

Performance Marketer.

Prerequisite:

Campaign Brief Done.

Responsibilities:

- Prepare campaign.
- Configure Meta advertising setup.
- Configure Flow tracking.
- Add/configure the correct dataset.
- Verify tracking setup.
- Prepare required campaign assets and settings.

This work may proceed in parallel with scriptwriting and ad copywriting.

### TASK 5 — Launch Destination Meta Campaign

Role:

Performance Marketer.

Prerequisites:

- Required edited video advertisement(s) approved.
- Required Meta ad copies approved.
- Campaign setup and tracking completed.

Launch must remain Blocked until ALL prerequisites are Done.

Do not consider Awaiting Approval sufficient.

### TASK 6 — Weekly Campaign Review

Role:

Performance Marketer.

Purpose:

- Review ongoing campaign results.
- Inspect lead quality.
- Review cost per lead.
- Identify necessary campaign adjustments.
- Record performance-related actions.

This task is intended to recur weekly after the project becomes Live/Ongoing.

Important phase boundary:

The template must preserve the recurrence definition and its relationship to campaign Live status.

Do not falsely claim recurring task creation works unless implemented and tested.

The persistent scheduling mechanism belongs to the later Agenda/worker notification phase unless the existing approved system already supports safe recurrence.

For Phase 4, implement a clean recurrence definition/configuration and appropriate project visibility, without inventing notification delivery.

If the first review task is created at instantiation, do not schedule it as actionable before the campaign is Live.

Document the activation behavior and remaining scheduling work precisely.

## 20.4 Campaign Dependency Graph

Required:

Campaign Brief → Video Script

Campaign Brief → Meta Ad Copies

Campaign Brief → Campaign Setup

Video Script → Video Editing

Video Editing → Campaign Launch

Meta Ad Copies → Campaign Launch

Campaign Setup → Campaign Launch

If multiple video ads are required, Campaign Launch must depend on all video assets explicitly selected as required.

Do not automatically make optional creative assets mandatory.

## 20.5 Multiple Video Advertisements

A campaign may require:

- One Video Ad.
- Two Video Ads.
- Three Video Ads.
- More, within reasonable validated limits.

Each video ad must have its own:

- Parent video production task.
- Scriptwriting subtask.
- Video editing subtask.
- Approval requirements.
- Dependencies.

Example:

Parent:

Produce Singapore Video Ad 1

Children:

- Write Singapore Video Ad 1 Script.
- Edit Singapore Video Ad 1.

Parent:

Produce Singapore Video Ad 2

Children:

- Write Singapore Video Ad 2 Script.
- Edit Singapore Video Ad 2.

Launch must wait for all explicitly selected required video assets.

Copywriting tasks must accurately represent five Meta Ad Copies per advertisement.

Do not create ambiguous copywriting deliverables if multiple ads are selected.

You may use one clearly scoped copywriting task per advertisement or an equivalent explicit work structure that accurately tracks required copies.

Avoid duplicate template node IDs after expansion.

## 20.6 Static and Carousel Ads

Graphic Designer is an optional functional job role.

If the campaign requires static or carousel creatives:

- Support optional graphic design nodes.
- Require valid Graphic Designer assignment.
- Configure approval as appropriate.
- Include required approved static/carousel deliverables in Launch prerequisites.

Do not automatically generate Graphic Designer work for a campaign that does not require it.

## 20.7 Parent Task Ownership

A prior specification referenced a Creative Lead/Manager as the owner of the parent video production task.

Creative Lead is NOT an approved separately defined job role.

Do not create a seventh functional job role.

Use a clear, documented parent-task coordination policy.

A Project Manager may own the parent as an authorized coordinator only where that employee is validly eligible and the model permits this separation from the child production roles.

Otherwise leave the parent explicitly unassigned and surface a Manager decision.

Never invent a random assignee.

## 20.8 Additional Campaign Setup Tasks

The agency also performs:

- Custom Columns in Meta Ads Manager named "Interscale Marketing".
- WhatsApp Business profile completion.

These may be part of the onboarding template or an explicitly selected campaign setup variation.

Do not duplicate one-time technical setup tasks across every campaign unnecessarily.

Ensure these agency SOP items are represented in the appropriate template configuration.

## 20.9 Campaign Template Tests

Test:

- Generate Singapore campaign.
- Generate Kashmir campaign.
- Destination variables resolve correctly.
- Correct functional roles.
- Multiple video ad expansion.
- Different assignees for scripts and editing.
- Approval settings.
- Campaign Brief prerequisite.
- Parallel work unlocking.
- Video editing after script approval.
- Launch waits for all required assets.
- Launch waits for approved Meta copies.
- Launch waits for tracking setup.
- Optional creative handling.
- Correct copywriting requirements.
- No accidental duplicate tasks.
- No premature weekly review activation.

Fix failures before Step 21.

---

# STEP 21 — CLIENT ONBOARDING & TECHNICAL SETUP TEMPLATE

## 21.1 Objective

Create the official reusable:

**Client Onboarding & Technical Setup Template**

This template should be used when a new travel agency client joins Interscale Marketing.

The goal is to automatically distribute onboarding work across departments.

## 21.2 Required Project Information

- Client.
- Project name.
- Start date.
- Target date if configured.
- Project Manager.
- Employee role assignments.
- Relevant onboarding instructions.
- Deadline overrides if needed.

## 21.3 Official Onboarding Workflow

Implement the following reusable structure.

### TASK 1 — Collect Client Requirements, Assets & Access

Role:

Project Manager.

Responsibilities:

- Gather client business information.
- Collect branding assets.
- Collect required social account access.
- Collect Meta Ads account permissions.
- Collect WhatsApp Business access.
- Collect Travel CRM information.
- Confirm relevant staff/contact information.
- Record access-readiness status.

Do not store passwords, API secrets, or private credentials inside task descriptions or audit logs.

Store non-sensitive confirmation states or approved reference links.

### TASK 2 — Audit Business Presence & Existing Advertising

Role:

Performance Marketer.

Prerequisite:

Required client information/access available.

Responsibilities:

- Audit website.
- Audit Google Business Profile.
- Audit social media presence.
- Review existing advertisements.
- Identify positioning and trust issues.
- Perform relevant competitor research.

### TASK 3 — WhatsApp Business Profile & WhatsApp Max Setup

Role:

Performance Marketer.

Prerequisite:

Required WhatsApp access confirmed.

Responsibilities:

- Complete WhatsApp Business profile.
- Configure WhatsApp Max workspace.
- Configure initial automation/qualification flow.
- Review business profile information.
- Validate initial configuration.

This is task management for existing WhatsApp Max software.

Do not build a new WhatsApp CRM or WhatsApp messaging API integration in Phase 4.

### TASK 4 — Meta Tracking, Dataset & Custom Columns

Role:

Performance Marketer.

Prerequisite:

Required Meta Ads access.

Responsibilities:

- Configure tracking.
- Configure Flow tracking where applicable.
- Set up/add the dataset.
- Create Custom Columns named "Interscale Marketing".
- Validate configuration.

### TASK 5 — Personalize Travel Agency CRM

Role:

CRM/Data Executive.

Prerequisite:

Required CRM access and onboarding information.

Responsibilities:

- Configure CRM for client requirements.
- Personalize available relevant settings.
- Configure necessary basic workflow data.

### TASK 6 — Enter Master Data, Packages & Itinerary Information

Role:

CRM/Data Executive.

Prerequisite:

Travel CRM personalization completed.

Responsibilities:

- Enter relevant master data.
- Configure supplied packages.
- Enter itinerary information.
- Validate required CRM records.

### TASK 7 — Final Validation & Onboarding Handover

Role:

Project Manager.

Prerequisites:

- Business audit complete.
- WhatsApp Business/WhatsApp Max setup complete.
- Meta tracking and dataset setup complete.
- CRM personalization complete.
- Required master data entry complete.

Responsibilities:

- Review implementation.
- Confirm required tasks.
- Identify remaining blockers.
- Record completion.
- Prepare handover for campaign launch.

## 21.4 Access Prerequisite Handling

Some tasks depend on access that the client has not yet supplied.

For example:

WhatsApp Max setup cannot proceed until required WhatsApp Business access is provided.

Use explicit manual confirmation of access readiness.

Do not automatically assume access has been granted.

Do not invent integration with Meta, Google, or WhatsApp account permission APIs.

Use the existing task workflow or appropriately modeled prerequisites to represent access confirmation safely.

Ensure there is no unnecessary blocker or impossible parent-child dependency cycle.

## 21.5 Parallel Onboarding Work

Some onboarding tasks may proceed in parallel when required access is ready.

Example:

- Meta tracking setup.
- WhatsApp setup.
- Business audit.

They do not need to wait for each other unless explicitly required.

CRM master data entry must wait for relevant CRM personalization work.

Final validation must wait for all configured required onboarding work.

## 21.6 Onboarding Assignment

Role mapping:

- Client requirements/access → Project Manager.
- Business audit → Performance Marketer.
- WhatsApp configuration → Performance Marketer.
- Meta tracking → Performance Marketer.
- CRM personalization → CRM/Data Executive.
- Master data entry → CRM/Data Executive.
- Final validation → Project Manager.

Resolve employees using existing client-specific role mappings.

Respect:

1. Explicit valid override.
2. Designated client employee.
3. Manual assignment fallback.

Never randomly assign an unrelated employee.

## 21.7 Onboarding Template Tests

Test:

- Correct project generation.
- Correct Project Manager assignment.
- Correct Performance Marketer tasks.
- Correct CRM/Data Executive tasks.
- Access confirmation prerequisites.
- Parallel eligible tasks.
- CRM personalization before master data.
- Final validation blocked until requirements done.
- Missing client role mapping.
- Client isolation.
- Correct audit events.
- No credentials stored in tasks.
- No duplicate work after retry.

Fix failures before Step 22.

---

# STEP 22 — ATOMIC PROJECT GENERATION ENGINE

## 22.1 Objective

Develop one reusable service that creates an entire project from a published template.

Suggested name:

`instantiateProjectTemplate`

This must be an actual backend orchestration service.

Do not implement project generation entirely in the frontend.

## 22.2 Input

Suggested inputs:

- Client ID.
- Published template ID/version.
- Project name.
- Destination when relevant.
- Start date.
- Optional target date.
- Required creative options.
- Video ad count.
- Authorized employee overrides.
- Relative deadline overrides.
- Idempotency key.

Use validated Zod schemas.

Reject unsupported or malformed input.

## 22.3 Authorization

Admin:

May instantiate published templates for authorized clients.

Manager:

May instantiate published templates only within their assigned client scope, according to approved project-creation permissions.

Employee:

Cannot instantiate project templates by default.

Never trust clientId or Manager ID supplied by the browser without authorization.

## 22.4 Instantiation Process

Perform the following operations safely:

1. Authenticate requester.
2. Validate access level and client scope.
3. Validate selected client exists and is active.
4. Validate template exists.
5. Validate version is published.
6. Validate all required input variables.
7. Validate all template nodes and dependencies.
8. Validate employee overrides.
9. Resolve client-specific designated employees.
10. Calculate relative deadlines.
11. Expand optional/repeated creative nodes.
12. Validate expanded node graph.
13. Create the Project.
14. Create all real Tasks.
15. Create all real Subtasks.
16. Build node-key-to-task-ID mapping.
17. Create actual TaskDependency edges.
18. Assign job-role requirements and eligible employees.
19. Apply approval requirements and authorized approvers.
20. Calculate correct initial blockers/states.
21. Create necessary audit/activity records.
22. Record project origin and template version.
23. Record unique generation/idempotency result.
24. Commit changes consistently.
25. Return generated Project ID and summary.

## 22.5 MongoDB Transaction Safety

Use short, replica-set-supported MongoDB transactions where practical.

Project creation should behave atomically:

**Either the complete project graph is created correctly or no incomplete project graph remains.**

Do not allow:

- Project without its required Tasks.
- Subtasks without valid parents.
- Missing required dependency edges.
- Duplicate project generation after retries.
- Half-created launch workflows.

Avoid slow external network calls inside the MongoDB transaction.

Compute and validate the template expansion before transactional writes where safe.

Do not include WhatsApp API calls.

## 22.6 Idempotency

Require a client-generated or server-managed idempotency key for template instantiation requests.

If the same request is retried with the same key and equivalent payload:

Return the original generated project result.

Do not generate a duplicate project.

If the same key is reused with conflicting input:

Return a clear conflict response.

Protect against concurrent duplicate requests.

Do not rely only on project-name uniqueness for idempotency.

Persist appropriate request identity/fingerprint and result mapping.

## 22.7 Template Snapshot

Each project must retain:

- Source template ID.
- Source template version.
- Template-generated node origin where needed.
- Original generation metadata.

Existing projects must remain independent of later template edits.

Editing a template must not silently:

- Rename existing tasks.
- Change existing assignees.
- Change existing deadlines.
- Change existing dependencies.
- Reset existing approvals.

## 22.8 Assignment Resolution

Follow this exact precedence:

1. Explicit valid template/creation override.
2. Client-designated primary employee for the functional role.
3. Manual resolution if missing.

Validate:

- Employee active.
- Required job role.
- Correct client membership.
- Authorized assignment.

If unresolved:

- Leave unassigned.
- Surface Needs Assignment.
- Do not use a random Project Manager fallback.

The project may still be created with unresolved assignments, provided all required work records remain consistent and clearly indicate that Manager action is needed.

## 22.9 Approval Resolution

Template nodes requiring approval must have a valid approval policy.

Prefer the project's authorized designated Manager/approver where consistent with existing application permissions.

Do not automatically assign approval authority to an employee who lacks Manager access.

If approval cannot be resolved safely:

- Surface Needs Approver or an equivalent setup warning.
- Prevent bypassing the approval gate.
- Require authorized Manager resolution before submission/approval.

Do not invent new application access levels.

## 22.10 Initial Status Calculation

Generated tasks must use the six approved statuses.

- Blocked.
- To Do.
- In Progress.
- Awaiting Approval.
- Done.
- Cancelled.

No seventh status.

Tasks with incomplete prerequisites should start Blocked.

Tasks with satisfied prerequisites and no manual blocker may start To Do.

Unassigned work must remain visibly non-actionable until resolved.

Do not initialize every generated task as To Do.

Do not mark future work Done.

Do not automatically unlock Launch.

## 22.11 Deadline Calculation

Calculate from template rules and creation inputs.

Example:

Project start date: User-selected.

Scriptwriting due date: Based on configured relative offset.

Editing due date: Based on configured relative offset.

Do not silently assume unapproved company deadlines.

Show deadline warnings where a child due date exceeds its parent deadline.

Do not create past-due deadlines without an explicit, valid override.

If due dates cannot be determined, show a clear required-input or missing-rule error rather than inventing dates.

## 22.12 Project Preview

Support a server-validated preview before creation.

Preview should show:

- Project name.
- Template/version.
- All generated tasks.
- Parent/subtask hierarchy.
- Functional role.
- Resolved employee.
- Needs Assignment warnings.
- Approval requirement.
- Resolved approver.
- Deadline.
- Initial status.
- Prerequisites.
- Optional selected creative work.
- Relevant unresolved configuration warnings.

The preview must be generated from the same deterministic expansion logic used by final creation.

Do not maintain two conflicting template interpreters.

## 22.13 Project Creation API

Implement an appropriate endpoint such as:

`POST /api/v1/projects/from-template`

Implement preview:

`POST /api/v1/projects/from-template/preview`

Use existing API conventions.

Require authorization.

Use Zod.

Support idempotency.

Ensure security applies to every generated record.

## 22.14 Step 22 Tests

Test:

- Create project from campaign template.
- Create project from onboarding template.
- Correct real tasks/subtasks.
- Correct dependencies.
- Correct client mapping.
- Correct destination variables.
- Correct approvals.
- Correct initial statuses.
- Correct deadlines.
- Multiple video ads.
- Missing assignees.
- Invalid employee override.
- Manager scope.
- Employee forbidden.
- Transaction rollback.
- Concurrent duplicate request.
- Same idempotency key retry.
- Conflicting payload/idempotency key.
- Invalid template version.
- Project name conflict.
- Template version snapshot.
- No changes to older generated projects.
- Correct audit history.

Fix failures before Step 23.

---

# STEP 23 — TEMPLATE MANAGEMENT UI & CREATE PROJECT WORKFLOW

## 23.1 Objective

Develop a clean, premium, responsive user interface for template management and project generation.

Use existing React application and design system.

Do not introduce a second frontend framework.

## 23.2 Templates Navigation

Enable Templates in the navigation for authorized users.

Admin sees full template administration.

Authorized Managers may see published templates needed for project generation.

Employees do not see unauthorized template administration controls.

## 23.3 Templates List

Show:

- Template name.
- Template type.
- Status.
- Published version.
- Number of task definitions.
- Last updated.
- Actions.

Actions may include:

- View.
- Create draft.
- Edit draft.
- Validate.
- Publish.
- Archive.
- Preview.

## 23.4 Template Editor

Create a simple form/list-based editor.

Admin can configure:

- Template name.
- Description.
- Type.
- Project variables.
- Tasks.
- Subtasks.
- Functional roles.
- Priorities.
- Approval requirements.
- Approver rules.
- Relative deadlines.
- Dependency relationships.
- Required/optional nodes.
- SOP/reference URLs.

Do not build a large drag-and-drop graphical workflow editor.

Simple forms and nested task lists are sufficient.

## 23.5 Template Dependency Configuration

Allow Admin to configure prerequisites between template nodes.

Show readable labels instead of raw MongoDB IDs.

Example:

"Edit Video Ad" depends on "Write Video Ad Script".

Validate circular and invalid parent-child relationships.

Display errors before publishing.

## 23.6 Template Version UI

Admin should be able to:

- View current published version.
- View older versions.
- Create new draft from published version.
- Edit draft.
- Validate draft.
- Publish new version.
- Archive templates.

Never allow in-place modification of an already published version.

## 23.7 Seeded Official Templates

Two official templates must be available:

1. Destination Meta Ads Campaign.
2. Client Onboarding & Technical Setup.

Seed idempotently.

Do not duplicate templates on every seed execution.

If an Admin has modified or published a newer version, rerunning seed must not overwrite those changes.

## 23.8 Create Project from Template

Update the existing Create Project workflow.

Allow:

- Create blank project, if authorized.
- Create project from template.

For template creation:

1. Select client.
2. Select template.
3. Enter project name.
4. Enter destination if campaign.
5. Set start date.
6. Set target date if applicable.
7. Choose required video/creative options.
8. Review employees.
9. Review approvals.
10. Review deadlines.
11. Preview full workflow.
12. Confirm Create Project.

Keep interface straightforward.

## 23.9 Preview UI

Show an understandable hierarchy.

Example:

Singapore Meta Ads Campaign

- Campaign Brief & Competitor Research
- Produce Singapore Video Ad
  - Write Video Ad Script
  - Edit Video Ad
- Write 5 Singapore Meta Ad Copies per Ad
- Campaign Setup & Tracking
- Launch Singapore Meta Campaign
- Weekly Campaign Review

Show:

- Assignee.
- Role.
- Due date.
- Approval requirement.
- Prerequisites.
- Initial status.

Clearly highlight:

- Needs Assignment.
- Missing approver.
- Missing deadline/configuration.
- Blocked work.

## 23.10 Successful Creation

After successful generation:

- Show confirmation.
- Navigate to the generated Project detail page.
- Display generated Tasks and Subtasks.
- Show actual dependencies.
- Show assigned employees.
- Show project progress.
- Show initial blocked/ready work.

Do not show fake completion statistics.

## 23.11 Error Handling

Handle:

- Missing client.
- Unauthorized client.
- Invalid template.
- No published version.
- Missing required variable.
- Missing employee mapping.
- Invalid override.
- Unresolved approval configuration.
- Duplicate project.
- Concurrent request.
- Transaction failure.

Show clear user-friendly errors.

Do not expose raw MongoDB stack traces.

## 23.12 Responsive Design

Use existing:

- Tailwind CSS.
- shadcn/ui.
- Radix UI.
- Lucide.
- TanStack Query.
- React Hook Form.
- Zod.
- Sonner.

Support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Accessible dialogs and form controls are required.

No fake buttons.

Every available action must have real functionality.

## 23.13 Step 23 Tests

Test:

- Template list.
- Template create/edit.
- Draft validation.
- Publish.
- Version history.
- Create project wizard.
- Preview.
- Employee mapping warnings.
- Destination substitution.
- Multiple creative options.
- Project creation success.
- Duplicate prevention.
- Template permission restrictions.
- Mobile template management.
- Mobile project creation.
- Real generated project navigation.

Fix failures before Step 24.

---

# STEP 24 — COMPLETE INTEGRATION, SECURITY AUDIT & END-TO-END TESTING

## 24.1 Objective

Verify that Phase 4 works with all previously completed phases.

Template-based project generation must be correct at database, API, and frontend levels.

Do not claim completion if important scenarios were not executed.

## 24.2 Required End-to-End Scenario — Campaign

Create isolated test data:

Client:

Travel Enfield.

Project:

Singapore Meta Ads Campaign.

Template:

Published Destination Meta Ads Campaign Template.

Employees:

- Video Ad Script Writer.
- Video Editor.
- Performance Marketer.
- Project Manager.

The creation workflow must:

1. Select client.
2. Select campaign template.
3. Enter Singapore destination.
4. Select required creative options.
5. Review generated workflow.
6. Confirm assignments.
7. Create project.
8. Generate required tasks and subtasks.
9. Generate required dependencies.
10. Preserve approval rules.
11. Record template version.
12. Return generated Project detail page.

## 24.3 Verify Generated Workflow

Expected:

Campaign Brief — To Do.

Video Script — Blocked.

Video Editing — Blocked.

Meta Ad Copies — Blocked.

Campaign Setup — Blocked.

Launch — Blocked.

Complete Campaign Brief.

Expected:

- Scriptwriting becomes actionable.
- Ad Copywriting becomes actionable.
- Campaign Setup becomes actionable.

Submit Video Script.

Expected:

- Editing remains Blocked.

Approve Video Script.

Expected:

- Editing becomes To Do.
- Correct Video Editor is assigned.

Approve edited video and Meta copies, and complete tracking.

Expected:

- Launch becomes actionable only after every configured required prerequisite is Done.

## 24.4 Multiple Video Ads Test

Generate a campaign requiring three video advertisements.

Verify:

- Three distinct production parent tasks.
- Three distinct scriptwriting subtasks.
- Three distinct video editing subtasks.
- Correct dependencies for each video.
- Unique node/task identities.
- Correct role mapping.
- Launch waits for all three required approved videos.
- Copywriting requirements match the chosen advertisement count.

## 24.5 Required End-to-End Scenario — Onboarding

Create:

Client:

A separate test travel agency.

Template:

Published Client Onboarding & Technical Setup Template.

Verify:

1. Project is created.
2. Project Manager tasks assigned correctly.
3. Performance Marketer tasks assigned correctly.
4. CRM/Data Executive tasks assigned correctly.
5. Missing external access blocks relevant setup.
6. Independent setup work can proceed in parallel when ready.
7. Master data entry waits for CRM personalization.
8. Final validation waits for required onboarding tasks.
9. All task activity and assignments are correctly recorded.

## 24.6 Template Versioning Tests

Test:

- Publish version 1.
- Create Project A.
- Create and publish version 2.
- Create Project B.
- Confirm Project A retains v1-generated work.
- Confirm Project B uses v2.
- Confirm older published versions remain immutable.
- Confirm archived template behavior.
- Confirm seed rerun cannot overwrite Admin edits.

## 24.7 Idempotency Tests

Test:

- Double-click Create Project.
- Network retry.
- Same idempotency key.
- Concurrent requests.
- Transaction rollback.
- Conflicting idempotency payload.
- No partial graph.
- No duplicate dependency edges.
- No duplicate task activity.

Use isolated MongoDB replica-set testing.

## 24.8 Authorization Tests

Verify:

- Admin can manage templates.
- Manager without Admin authority cannot edit templates.
- Employee cannot create/edit/publish templates.
- Authorized Manager can instantiate published templates for assigned clients.
- Unauthorized Manager cannot instantiate for unrelated clients.
- Employee cannot instantiate templates.
- Generated project permissions remain client-scoped.
- Template overrides cannot be used for privilege escalation.
- Cross-client employee assignment rejected.
- Ineligible approvers rejected.
- IDOR prevention.
- Raw template internals cannot leak unauthorized client information.

## 24.9 Database Integration Tests

Test:

- Template model.
- Template version model.
- Template nodes.
- Template dependencies.
- Publish validation.
- Graph expansion.
- Real task creation.
- Real subtask creation.
- Assignment resolution.
- Deadline rules.
- Dependency graph correctness.
- Approval rules.
- Transaction atomicity.
- Idempotency.
- Version immutability.
- Concurrency.

All transaction tests must execute against an isolated replica set.

## 24.10 Playwright E2E Tests

Implement and execute real browser tests covering at least:

1. Admin login.
2. Open Templates.
3. View official templates.
4. Create template draft.
5. Add task node.
6. Add subtask node.
7. Configure job role.
8. Configure approval.
9. Configure dependency.
10. Reject circular dependency.
11. Validate draft.
12. Publish template.
13. View version history.
14. Create campaign from template.
15. Enter destination.
16. Review generated preview.
17. Review employee assignments.
18. Create project.
19. Verify generated subtasks.
20. Verify generated dependencies.
21. Complete Campaign Brief.
22. Verify parallel work unlocks.
23. Approve Scriptwriting.
24. Verify Video Editing becomes actionable.
25. Generate campaign with multiple video ads.
26. Verify Launch waits for required creative approvals.
27. Create onboarding from template.
28. Verify CRM setup dependencies.
29. Verify onboarding final validation prerequisites.
30. Test missing employee mapping.
31. Test idempotent retry.
32. Test unauthorized template mutation.
33. Test Manager client scope.
34. Test Employee restrictions.
35. Test mobile template list.
36. Test mobile create project wizard.
37. Verify prior project/task functionality.
38. Verify authentication regression.

Additional tests are welcome where they verify genuine risk.

Do not count test scenarios as separate passing tests unless they were actually executed as such.

## 24.11 Regression Testing

All Phase 1–3 functionality must remain operational.

Retest:

- Authentication.
- Bootstrap.
- Employee management.
- Client management.
- Functional roles.
- Manager capabilities.
- Manual project creation.
- Manual task creation.
- Real subtasks.
- Approval workflows.
- Revision workflows.
- Dependency creation.
- Cycle prevention.
- Automatic unlocking.
- Client-specific assignment.
- Manual assignment preservation.
- Downstream review.
- My Tasks.
- Approval queue.
- Dashboards.
- Mobile navigation.

## 24.12 Security Audit

Review:

- Authentication.
- Active-session enforcement.
- Admin-only template management.
- Manager-scoped template use.
- Employee restrictions.
- Cross-client isolation.
- Role-based assignment validation.
- Approver authorization.
- Template variable injection.
- Graph validation.
- Concurrent publish.
- Idempotency abuse.
- Transaction boundaries.
- Audit-log redaction.
- MongoDB error exposure.
- Dangerous template expressions.
- Invalid template nodes.
- Unauthorized modification of existing generated projects.

Document findings and corrections.

## 24.13 Quality Gates

Run:

- pnpm format:check
- pnpm lint
- pnpm typecheck
- pnpm build
- pnpm test
- Relevant Playwright E2E commands

Report exact:

- Tests passed.
- Tests failed.
- Tests skipped.
- Tests not executed.

Do not report skipped MongoDB transaction tests as verified.

Fix failures before declaring Phase 4 complete.

## 24.14 Documentation

Update:

- README.md.
- AGENTS.md.
- docs/03-authorization.md.
- docs/04-data-model.md.
- docs/05-api.md.
- docs/06-frontend.md.
- docs/07-development-phases.md.
- docs/08-testing-strategy.md.
- docs/decisions.md.
- docs/traceability.md.

Preserve:

docs/00-product-requirements.md

as the original specification.

Document:

- Template data model.
- Published version immutability.
- Official seeded templates.
- Template variables.
- Template graph validation.
- Deadline calculation.
- Employee assignment precedence.
- Approver resolution.
- Atomic project generation.
- Idempotency keys.
- Multiple video ad expansion.
- Missing assignments.
- Project creation workflow.
- API endpoints.
- Test coverage.
- Known limitations.
- Phase 5 notification integration points.

---

# 5. IMPORTANT PHASE BOUNDARIES

Phase 4 includes:

- Admin-managed templates.
- Template versions.
- Task/subtask definitions.
- Template dependency definitions.
- Campaign template.
- Onboarding template.
- Template preview.
- Automatic project/task/subtask generation.
- Automatic employee role resolution.
- Automatic approval configuration.
- Automatic dependency generation.
- Template management frontend.
- Project creation wizard.
- Testing and documentation.

Phase 4 does NOT include:

## Phase 5 — WhatsApp Notifications

Do not implement:

- Meta WhatsApp Cloud API messages.
- WhatsApp message templates.
- Task due reminders.
- Overdue notifications.
- WhatsApp escalation.
- Provider delivery webhooks.
- Message retry infrastructure.

## Phase 6 — Meetings

Do not implement:

- Client meeting calendar.
- Meeting agendas.
- Meeting notes.
- Meeting action items.
- Meeting-linked task generation.
- Meeting reminders.

## Phase 7 — Final Deployment

Do not implement:

- AWS EC2 production deployment.
- Final deployment automation.
- Infrastructure provisioning.
- Full production security hardening beyond necessary Phase 4 protections.

No native mobile application.

No creative hosting.

No Gantt charts.

No AI workflow builder.

No internal team chat.

---

# 6. CROSS-PHASE INTEGRATION RULES

## 6.1 Preserve Phase 3 Dependencies

Every template dependency must instantiate into real Phase 3 dependency records.

Do not build a parallel dependency engine.

## 6.2 Preserve Phase 3 Automatic Unlocking

Generated tasks must automatically unlock when their real prerequisites become Done.

Do not bypass the existing transition engine.

## 6.3 Preserve Phase 2 Approvals

Approval-required generated tasks must use existing:

- Submit.
- Approve.
- Request Revision.
- Reopen.
- Audit history.

Do not create template-only approval statuses.

## 6.4 Preserve Phase 2 Subtasks

Generated subtasks must remain real Task records with parentTaskId.

One-level nesting only.

## 6.5 Preserve Phase 1 Client Mappings

Use actual client-role assignments.

No random assignees.

No invented job roles.

## 6.6 Preserve Phase 1 Permissions

Admin/Manager/Employee access levels remain unchanged.

Do not grant Manager permissions merely because someone has a Project Manager functional job role.

## 6.7 Preserve Future Phase Compatibility

The system must remain compatible with:

- Phase 5 WhatsApp notifications.
- Phase 6 Meetings.
- Phase 7 Deployment.

Avoid irreversible schema decisions.

---

# 7. DEVELOPMENT RULES

1. Work sequentially.
2. Do not skip tests.
3. Fix errors before moving on.
4. Keep controllers thin.
5. Use existing service boundaries.
6. Validate inputs with Zod.
7. Enforce authorization server-side.
8. Use MongoDB transactions safely.
9. Preserve client isolation.
10. Preserve existing task history.
11. Do not mutate published versions.
12. Do not overwrite existing projects when templates change.
13. Reject invalid template graphs.
14. Never randomly assign employees.
15. Do not invent deadlines.
16. Prevent duplicate project creation.
17. Do not build unnecessary infrastructure.
18. Use real backend data in frontend.
19. Make UI accessible and responsive.
20. Do not introduce prohibited technology.
21. Update documentation.
22. Report real test results.
23. Do not claim future features are already implemented.
24. Stop after Step 24.

---

# 8. REQUIRED EXECUTION ORDER

Execute in this exact order:

## Step 19 — Template Foundation

- MongoDB models.
- Shared schemas.
- Versioning.
- Validation.
- CRUD API.
- Publish logic.
- Security.
- Tests.

## Step 20 — Campaign Template

- Official template seed.
- Campaign nodes.
- Scriptwriting/editing.
- Ad copywriting.
- Campaign setup.
- Launch dependencies.
- Multiple video ads.
- Optional creatives.
- Tests.

## Step 21 — Onboarding Template

- Official template seed.
- Access collection.
- Business audit.
- WhatsApp setup.
- Meta tracking.
- Travel CRM setup.
- Master data.
- Final validation.
- Tests.

## Step 22 — Project Generation

- Preview service.
- Variable substitution.
- Deadline calculation.
- Employee resolver.
- Approver resolver.
- Node expansion.
- Atomic project generation.
- Dependency generation.
- Idempotency.
- Audit history.
- Tests.

## Step 23 — Frontend

- Templates list.
- Template editor.
- Version management.
- Create Project wizard.
- Workflow preview.
- Needs Assignment indicators.
- Responsive design.
- Tests.

## Step 24 — Final Verification

- Complete business E2E.
- Security audit.
- MongoDB integration tests.
- Phase 1–3 regressions.
- Documentation.
- Final report.

Do not ask for approval after Steps 19–23.

Continue unless a critical blocker requires user input.

---

# 9. PHASE 4 FINAL ACCEPTANCE CRITERIA

Phase 4 is complete ONLY when:

- Admin can create and manage templates.
- Employees cannot modify templates.
- Authorized Managers can instantiate published templates within their assigned client scope.
- Published template versions are immutable.
- Template drafts can be edited safely.
- Invalid template graphs cannot be published.
- Campaign template exists and is seeded idempotently.
- Onboarding template exists and is seeded idempotently.
- Campaign generation supports different destinations.
- Generated project names and task titles contain correct destination.
- Real tasks and subtasks are generated.
- Functional job roles are correct.
- Client-specific employees are assigned correctly.
- Manual/template overrides are validated.
- Missing assignments are visible.
- Approver authorization is preserved.
- Correct dependency edges are generated.
- Scriptwriting is blocked until the brief is Done.
- Editing is blocked until script approval.
- Launch is blocked until every required prerequisite is Done.
- Multiple required video advertisements work.
- Meta ad copywriting matches the selected number of ads.
- Optional static/carousel work is not forced on unrelated campaigns.
- Onboarding setup tasks follow correct access prerequisites.
- CRM master data waits for CRM personalization.
- Onboarding final validation waits for required tasks.
- Relative deadlines are calculated correctly.
- No arbitrary deadlines are invented.
- Template preview matches generated project.
- Repeated submission cannot create duplicate projects.
- Transaction failures cannot leave partial projects.
- Old generated projects remain unchanged after template updates.
- Existing Phase 3 auto-unlocking works for generated tasks.
- Existing Phase 2 approvals work for generated tasks.
- Existing Phase 1 permissions remain secure.
- Responsive frontend works.
- Unit tests pass.
- MongoDB integration tests pass.
- Playwright E2E tests pass.
- Previous phase regressions pass.
- Build passes.
- Typecheck passes.
- Lint passes.
- Format check passes.
- Documentation is updated.
- No prohibited technologies are added.

Do not claim full completion if a critical acceptance criterion fails.

---

# 10. REQUIRED PHASE 4 COMPLETION REPORT

After finishing all six steps, provide one consolidated report.

Include:

1. Overall Phase 4 verdict.
2. Step 19 summary.
3. Step 20 summary.
4. Step 21 summary.
5. Step 22 summary.
6. Step 23 summary.
7. Step 24 summary.
8. Files created/modified.
9. MongoDB models and indexes.
10. Template versioning implementation.
11. Template validation implementation.
12. Official Campaign template details.
13. Official Onboarding template details.
14. Multiple video advertisement handling.
15. Template variable substitution.
16. Deadline calculation.
17. Employee assignment precedence.
18. Missing-assignment behavior.
19. Approver resolution.
20. Atomic generation and idempotency.
21. Generated task/subtask/dependency integrity.
22. REST API endpoints.
23. Frontend pages and user workflows.
24. Unit/integration test results.
25. Playwright E2E test results.
26. Previous phase regression results.
27. Security findings.
28. Bugs discovered and fixed.
29. Known limitations and deferred requirements.
30. Documentation changes.
31. Git state and commits.
32. Readiness for Phase 5.

Report exact test counts:

- Passed.
- Failed.
- Skipped.
- Not executed.

Distinguish:

- Functionality implemented.
- Functionality tested.
- Functionality deferred to Phase 5.

Do not claim WhatsApp notifications work.

Do not claim recurring weekly reminders work if no scheduling mechanism has been implemented.

---

# 11. FINAL STOP INSTRUCTION

After completing Step 24:

**STOP DEVELOPMENT.**

Do not begin Phase 5.

Do not implement WhatsApp Business Cloud API notification delivery.

Do not implement meeting scheduling.

Do not deploy the application to AWS.

Provide the complete Phase 4 completion report.

Wait for my explicit approval before beginning Phase 5.

The desired result is a production-quality, reusable template system that automatically generates destination campaigns and client onboarding projects with correct tasks, subtasks, employee assignments, approvals, deadlines, dependencies, and safe versioning—fully integrated into the existing Interscale Marketing application.