# 02 — Authentication

Authoritative requirement: [00-product-requirements.md](./00-product-requirements.md)
§4. This document is the implementation contract for Phase 1.

## 1. Technology

- **Better Auth** with `@better-auth/mongo-adapter` and the **Admin plugin**.
- **Email + password** only. No OAuth, no magic links, no public registration.
- Secure, HTTP-only, server-managed session cookies.
- Integrated into the Express 5 API.

## 2. Initial Admin bootstrap

A secure one-time bootstrap script creates the first Admin.

- Admin email and initial password come from **server-side environment
  variables** (`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`).
- Passwords are hashed; plaintext is never stored, logged, or sent to the
  frontend.
- The script must be **safe to rerun**: it must not create a duplicate account
  and must not overwrite/reset an existing Admin password.
- Startup must never automatically reset an existing Admin password.

## 3. Login only

- Employees log in with email + password.
- There is **no public registration page or signup workflow**.
- Public signup is disabled at the **authentication-library level**, not only in
  the frontend. Verify the actual routes registered by the installed Better Auth
  version and its plugins, and confirm they are protected.

## 4. Employee account creation (Admin only)

Admin can create employees, assign access levels, assign one or more job roles,
configure client assignments, set status, and update permitted details.

Secure initial-password flow (approved MVP):

1. Generate a **cryptographically secure** temporary password.
2. Display it to the Admin **once**.
3. Require the employee to change it on first login.

One-time secure setup links may be used only if their delivery mechanism is
explicitly approved. No unapproved email service.

## 5. Access levels vs. internal roles

The only three application access levels are **Admin / Manager / Employee**.
They are deliberately separate from the Better Auth internal administrative
role. Account-administration endpoints must be protected **server-side**; plugin
endpoints must not be assumed private just because the frontend omits them.

## 6. Session and transport security

- HTTP-only secure cookies; HTTPS in production.
- Trusted-origin configuration; appropriate SameSite and CSRF protection.
- Rate limiting on sensitive authentication routes.
- Password hashing; secure session invalidation; logout.
- All protected API endpoints require authentication and server-side
  authorization.

## 7. Threats explicitly prevented

Public account creation · privilege escalation · session bypass · unauthorized
account management · unauthorized access via modified entity IDs (IDOR).

## 8. Account lifecycle

- **Activate / deactivate**: deactivated users cannot access protected
  resources; existing sessions must be invalidated.
- **Session revocation**: Admin can revoke sessions; logout invalidates the
  session server-side.
- **Forced password change**: users created with a temporary password must
  change it before accessing other functionality.

## 9. Cross-origin note

The approved stack does **not** include a CORS package. Authentication relies on
**same-origin** requests: the Vite dev server proxies `/api` to the API, and in
production Nginx serves the SPA and reverse-proxies the API on one origin. See
[adr/0002-same-origin-no-cors.md](./adr/0002-same-origin-no-cors.md).

## 10. Open items (do not invent)

- Exact employee invitation / password-delivery workflow (§22 item 8).
- Precise audit-retention rules (§22 item 10).
- Version-specific Better Auth APIs, adapter identity-ID behavior, and plugin
  endpoint protection must be verified against installed versions before use.
