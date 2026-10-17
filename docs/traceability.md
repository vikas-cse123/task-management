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
| Phase 1 feature work | Auth, users, roles, clients, permissions | REQ-AUTH, REQ-ROLES, REQ-PERM, REQ-CLIENT, REQ-SEC |

## Status legend

Steps 0–1 and the shared-contracts / database-foundation step are complete and
verified. Phase 1 authentication/authorization feature work has not started and
requires explicit approval.
