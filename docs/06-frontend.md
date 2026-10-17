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
