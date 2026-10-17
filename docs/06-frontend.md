# 06 — Frontend (Phase 1)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§13 and §25.6. Responsive web app; desktop and mobile widths; loading, empty,
error, and success states everywhere.

## 1. Foundation

- React + TypeScript + Vite + React Router.
- TanStack Query for server state; React built-in state for local UI state.
- Tailwind CSS with shadcn/ui, Radix UI primitives, Lucide icons, Sonner toasts.
- React Hook Form + Zod resolvers for forms.
- Responsive sidebar navigation with a mobile drawer.
- Route guards: unauthenticated → login; unauthorized → Forbidden page.

## 2. Phase 1 screens

| Screen | Route (planned) | Notes |
| --- | --- | --- |
| Login | `/login` | Email + password. No signup link. |
| Forced password change | `/change-password` | Shown when `mustChangePassword`. |
| Profile | `/profile` | Own details; WhatsApp number/opt-in display. |
| Admin dashboard | `/` | Overview foundation (counts added later). |
| Employees list | `/team` | Admin: list, status, level, roles, clients. |
| Employee create | `/team/new` | Admin; shows one-time temporary password. |
| Employee detail/edit | `/team/:id` | Admin; access level, job roles, status, sessions. |
| Departments | `/settings/departments` | List; Admin edits description. |
| Job roles | `/settings/job-roles` | List; Admin edits description. |
| Clients list | `/clients` | Scoped list. |
| Client detail | `/clients/:id` | Team, role mappings, later projects. |
| Client create | `/clients/new` | Admin-only initially. |
| Client team / role assignments | within client detail | Designated employee per role. |
| Forbidden | `/forbidden` | 403. |
| Not found | `*` | 404. |

Do not implement future-phase functionality (tasks, dependencies, templates,
meetings, WhatsApp) prematurely.

## 3. Component conventions

- Accessible, reusable components; keyboard and screen-reader support.
- Shared UI primitives live under `apps/web/src/components`.
- Use TanStack Query for all fetches; optimistic updates only when safe.
- Consistent toast feedback via Sonner; inline validation via Zod messages.
- Navigation and layout live under `apps/web/src/components/layout`.

## 4. Phase 1 non-goals (frontend)

Gantt charts, Kanban boards, file uploads, AI features, internal chat, client
portal, billing — all explicitly out of scope (see §21).

## 5. Step 4 screens

- `/team` (Admin only, also enforced server-side): employee table with a create/edit
  dialog, a one-time temporary-password banner, and a revoke-sessions action.
- `/` Overview: greets the signed-in user; reads state from `GET /api/v1/me`.
- `/login`, `/change-password`, `/forbidden`, and a `404` page.
- Navigation lives in `AppLayout`; the Team link is rendered only for Admins.

## 6. Step 5 screens

- `/clients`: scope-filtered list with search and Admin-only creation.
- `/clients/:id`: settings (Admin / `clients.manage`), team membership
  management and designated-role assignment (`clients.team.manage`).
  Employee pickers are shown to Admins; Managers enter the employee id.

## 7. Step 6: as-built Phase 1 screens (all verified responsive + E2E)

| Screen | Route | Access |
| --- | --- | --- |
| Overview dashboard | `/` | All roles; real scoped data (clients, employees for Admin, capabilities, items needing attention). |
| Clients list | `/clients` | All roles; scope-filtered; Admin-only creation. |
| Client detail | `/clients/:id` | In-scope only; settings, team, designations gated by capability. |
| Team | `/team` | Admin only (route + server). |
| Settings (departments, job roles) | `/settings` | Admin only (route + server). |
| Profile | `/profile` | All roles; read-only + change-password link. |
| Login | `/login` | Public; no signup link. |
| Forced password change | `/change-password` | Signed-in users with `requiresPasswordChange`. |
| Forbidden | `/forbidden` | All. |
| Not found | `*` | All. |

Deliberate consolidations versus the §2 plan: employee create/edit and client
create are inline dialogs/forms on their list pages (not separate routes);
reference-data editing lives under the single `/settings` screen (not separate
department/job-role routes). No Phase 2 functionality is rendered anywhere.

## 8. Steps 7–11 screens

| Screen | Route | Access |
| --- | --- | --- |
| Projects list | `/projects` | All roles; scope-filtered; search/status/type filters; Admin-only creation. |
| Project detail | `/projects/:id` | In-scope only; settings, status, manager, task list with counts, activity. |
| Task detail | `/tasks/:id` | Assigned/scoped only; workflow actions by permission; subtasks; activity. |
| My Tasks | `/my-tasks` | Own assignments; view presets (Today/Upcoming/Overdue/…), client/project/priority/search filters, TanStack Table sorting + pagination. |
| Approvals | `/approvals` | Awaiting Approval where caller is designated approver; approve/revise with mandatory reason. |
| Overview (expanded) | `/` | Scoped summary: clients, projects, due today, overdue, blocked, approvals, completed; workload by employee/role (non-employees); personal counts for employees. |

Approvals and My Tasks appear for every role (queues are simply empty without
applicable work). Meetings stay hidden until Phase 6.

## 9. Steps 19–23 screens (Phase 4)

| Screen | Route | Access |
| --- | --- | --- |
| Templates list | `/templates` | Managers and Admins (route `RequireManagerOrAdmin`); Admins see drafts/archived and creation, Managers see published only. |
| Template detail / editor | `/templates/:id` | Same; Admin-only node editor, save draft, validate, publish and archive actions. |
| Project creation wizard | within `/projects` | `projects.create_from_template` holders within client scope; template, client, destination, creative types, video-ad count, manager, role/deadline overrides, live preview. |

- The Templates navigation link is rendered only for Managers and Admins.
- The wizard collects inputs, calls the server-validated preview
  (`POST /projects/from-template/preview`) and creation
  (`POST /projects/from-template`), and surfaces warnings (missing assignments,
  missing approvers, empty variables, deadline issues) before and after
  creation.
- The template editor edits the persisted draft (nodes, one-level subtasks,
  per-node role/approval/assignment/deadline rules, `{{variable}}` titles and
  prerequisite edges); Validate and Publish operate on the saved draft, so
  content must be saved first. Editor validation errors are shown inline.
- Meetings remain hidden until Phase 6.

## 10. Step 29 screens (Phase 5 — notifications)

| Screen | Route | Access |
| --- | --- | --- |
| Notification centre | `/notifications` | Any active session (own notifications only); read/unread, failed-delivery visibility, mobile layout. |
| Profile — WhatsApp consent | `/profile` | Any active session; set/clear phone number and opt-in/opt-out. |
| Settings — Notifications | `/settings` (section) | Admin only; channel enable, sender, template mappings, statistics, delivery logs, integration/worker status, manual retry. |

- The navigation shell shows an unread-notification count (via
  `hooks/useNotifications.ts`).
- The centre is recipient-scoped by the API; the UI cannot request another
  employee's notifications.
- Meetings screens stay hidden until Phase 6.
