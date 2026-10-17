# 05 — API (Phase 1)

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§17 and §25.5. Base path: `/api/v1`. Better Auth routes use their own required
prefix.

## 1. Conventions

- REST, JSON. Input validated with **Zod** at the boundary.
- Auth via secure session cookie; authorization enforced **server-side**.
- Consistent error shape: `{ error: { code, message, details? }, requestId }`.
- Every request has a **request ID** (header `x-request-id`), included in logs
  and error responses.
- Pagination via `limit` / `cursor` (or `page`) query params; lists return
  `{ data, page }` envelope.
- Idempotency keys required on operations where duplicate execution would create
  duplicate work (e.g. project-from-template, task creation from action items,
  notification dispatch) — later phases.
- Documented with OpenAPI/Swagger.

## 2. Phase 1 endpoints

### Health
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Public | Liveness/readiness JSON. |

### Authentication (Better Auth)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | (Better Auth) sign-in | Public | Email + password. |
| POST | (Better Auth) sign-out | Session | Server-side invalidation. |
| GET | (Better Auth) session | Session | Current session/profile. |
| POST | (Better Auth) change-password | Session | Supports forced change. |

Public signup endpoints must be **disabled** at the library level.

### Users / employees (Admin only for writes)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | Admin | List employees. |
| POST | `/api/v1/users` | Admin | Create employee; returns one-time temporary password. |
| GET | `/api/v1/users/:id` | Admin, or self | Admin sees any; others only self. |
| PATCH | `/api/v1/users/:id` | Admin | Update permitted details. |
| PATCH | `/api/v1/users/:id/access-level` | Admin | Change access level (audited). |
| PATCH | `/api/v1/users/:id/job-roles` | Admin | Set functional job roles (audited). |
| PATCH | `/api/v1/users/:id/status` | Admin | Activate/deactivate (audited). |
| POST | `/api/v1/users/:id/sessions/revoke` | Admin | Revoke sessions. |
| GET | `/api/v1/me` | Session | Current application profile. |

### Departments (seeded)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/departments` | Session | List departments. |
| GET | `/api/v1/departments/:id` | Session | Detail. |
| PATCH | `/api/v1/departments/:id` | Admin | Update description/settings. Deletion blocked. |

### Job roles (seeded)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/job-roles` | Session | List job roles. |
| GET | `/api/v1/job-roles/:id` | Session | Detail. |
| PATCH | `/api/v1/job-roles/:id` | Admin | Update description/settings. Deletion blocked. |

### Clients
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/clients` | Scoped | Admin sees all; Manager/Employee see permitted scope only. |
| POST | `/api/v1/clients` | Admin | Create client (Admin-only initially). |
| GET | `/api/v1/clients/:id` | Scoped | Detail; not found if out of scope (no IDOR). |
| PATCH | `/api/v1/clients/:id` | Admin, or `clients.manage` within scope | Update client. |
| GET | `/api/v1/clients/:id/team` | Scoped | Team members + role mappings. |
| PUT | `/api/v1/clients/:id/team` | Admin, or `clients.team.manage` within scope | Manage client team mappings. |
| GET | `/api/v1/clients/:id/role-assignments` | Scoped | Designated assignments. |
| PUT | `/api/v1/clients/:id/role-assignments` | Admin, or `clients.team.manage` within scope | Set designated employee per role (validated active + holds role). |

### Audit (Phase 1, read-only)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/audit-logs` | Admin | Query by entity/actor/date. |

## 3. Error codes (Phase 1)

`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`,
`CONFLICT`, `CONCURRENT_MODIFICATION`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Missing client-role mapping, invalid due date, circular dependency, unauthorized
operation, concurrent modification, and failed WhatsApp delivery each surface a
clear, specific error rather than an unexplained failure (later phases).

## 4. Authorization notes

- List/detail endpoints are **scope-filtered** in the service layer, never by
  trusting client-provided IDs.
- Write endpoints check base level + capability + scope.
- Account-administration and template/workspace endpoints are Admin-only.
- All critical permission/assignment changes write to `auditLogs`.
