# ADR 0002 — Same-Origin Requests, No CORS Package

- **Status:** Accepted
- **Date:** 2026-10-17
- **Context:** The final approved technology stack (§15) does not include a CORS
  middleware package, and adding unapproved dependencies is prohibited. The SPA
  and API need to communicate, including cookie-based sessions.
- **Decision:** Serve everything from a single origin and avoid cross-origin
  requests entirely:
  - Development: the Vite dev server proxies `/api` to the API
    (`http://127.0.0.1:4000`).
  - Production: Nginx serves the built SPA and reverse-proxies `/api` to the
    Express process on the same origin.
  - Session cookies are first-party; `TRUSTED_ORIGINS` is configured for
    Better Auth.
- **Consequences:**
  - No CORS package is required, keeping the stack exactly as approved.
  - Session/CSRF handling is simplified (same-origin).
  - Any future cross-origin client would require revisiting this decision.
- **Alternatives considered:** Adding a CORS middleware (rejected: unapproved
  dependency); token-in-header auth (rejected: spec mandates secure session
  cookies).
