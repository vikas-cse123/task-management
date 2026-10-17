# Traceability

Requirement IDs mapped to owning documents and delivery phase. IDs are stable
and referenced by tests and commits. Full requirement text lives in
[00-product-requirements.md](./00-product-requirements.md).

| ID | Requirement area | Reference | Phase | Docs |
| --- | --- | --- | --- | --- |
| REQ-AUTH | Authentication (Better Auth, bootstrap, login-only, account lifecycle, security) | §4 | 1 | 02 |
| REQ-ROLES | Access levels + functional job roles + separation | §3, §4.5 | 1 | 03 |
| REQ-PERM | Permission matrix, capabilities, scope enforcement | §5 | 1 | 03 |
| REQ-CLIENT | Client management + client-specific teams + role mapping | §6 | 1 | 03, 04 |
| REQ-DATA | MongoDB data model + indexes | §16 | 1+ | 04 |
| REQ-API | REST API surface + conventions | §17 | 1+ | 05 |
| REQ-UI | Screens + navigation | §13 | 1+ | 06 |
| REQ-SEC | Security/audit/reliability | §18 | 1+ | 03, 08, 09 |
| REQ-TEST | Testing + acceptance criteria | §19 | 1+ | 08 |
| REQ-QUAL | Code quality practices | §24 | all | AGENTS.md |
| REQ-PROJ | Projects | §2 | 2 | 07 |
| REQ-TASK | Tasks + subtasks + statuses + parent rules | §7 | 2 | 04, 07 |
| REQ-OVERDUE | Overdue computed separately from status | §7.6 | 2 | 07 |
| REQ-DEP | Dependency + approval engine + concurrency | §8 | 3 | 07 |
| REQ-TMPL | Reusable templates (A campaign, B onboarding) | §9 | 4 | 07 |
| REQ-WA | WhatsApp notifications + outbox + compliance | §11 | 5 | 07 |
| REQ-WORKER | Background worker (Agenda v6) | §12 | 5 | 07, 09 |
| REQ-MEET | Meeting management + action items → tasks | §10 | 6 | 07 |
| REQ-DASH | Dashboards + workload definition | §14 | 7 | 07 |
| REQ-DEPLOY | AWS EC2 / Nginx / PM2 / HTTPS deployment | §15.9 | 7 | 09 |
| REQ-OOS | Out-of-scope / prohibited technologies | §21 | all | 01, AGENTS.md |
| REQ-OPEN | Unresolved requirements (do not invent) | §22 | all | decisions.md |
| REQ-CORR | Corrections A–G to the prior plan | §23 | all | decisions.md |

## Phase 1 step traceability

| Step | Scope | Primary REQs |
| --- | --- | --- |
| Step 0 | Preserve requirements + project docs | all (docs) |
| Step 1 | Monorepo foundation + toolchain + CI + skeletons | REQ-DATA (connection), REQ-DEPLOY (env), REQ-QUAL, REQ-TEST (harness) |
| Foundation step | Shared Phase 1 contracts; MongoDB domain models + indexes; client-role assignment integrity service; idempotent reference-data seed; Better Auth identity decision (ADR 0004) | REQ-ROLES, REQ-PERM (lessons/labels), REQ-CLIENT, REQ-DATA, REQ-SEC (audit), REQ-QUAL, REQ-TEST |
| Step 3 | Authentication: Better Auth + MongoDB adapter, login-only, profile on the user document (ADR 0005), blocked Admin-plugin surface, forced first-login change, Admin bootstrap, `/api/v1/me` + change-password, guarded frontend routes, auth tests | REQ-AUTH, REQ-SEC, REQ-API (partial), REQ-UI (auth screens), REQ-TEST |
| Step 4 | Employees, access levels, departments, job roles, Manager capabilities, employee API + screens | REQ-ROLES, REQ-PERM, REQ-API, REQ-UI |
| Step 5 | Clients, client teams, designated roles, primary manager | REQ-CLIENT, REQ-PERM, REQ-API, REQ-UI |
| Step 6 | Navigation shell, real-data dashboard, security audit, E2E + integration tests, docs, final report | REQ-UI, REQ-SEC, REQ-TEST, REQ-QUAL |
| Step 7 | Projects: model/contracts/service/API/UI/tests | REQ-CLIENT (project scope), REQ-API, REQ-UI, REQ-TEST |
| Step 8 | Tasks: model/contracts/assignment/activity/API/tests | REQ-TASK (engine), REQ-API, REQ-TEST |
| Step 9 | Real subtasks: nesting/progress/guards/UI/tests | REQ-TASK (subtasks), REQ-UI, REQ-TEST |
| Step 10 | Status engine + approvals: transitions/queue/concurrency/tests | REQ-TASK (workflow), REQ-SEC, REQ-TEST |
| Step 11 | Screens: My Tasks/Projects/Task detail/Approvals/dashboard/nav | REQ-UI, REQ-DASH (Phase 2 subset), REQ-TEST |
| Step 12 | Phase 2 audit, 24-scenario E2E + regression, docs, final report | REQ-SEC, REQ-TEST, REQ-QUAL |
| Phase 3+ | Dependencies, templates, WhatsApp, meetings, deployment | REQ-DEP, REQ-TMPL, REQ-WA, REQ-MEET, REQ-DASH, REQ-DEPLOY |

## Status legend

Steps 0–6 (all of Phase 1) and Steps 7–12 (all of Phase 2: projects, tasks,
real subtasks, status engine, approvals, screens, final verification) are
complete and verified. Phase 3+ work has not started and requires explicit
approval.
