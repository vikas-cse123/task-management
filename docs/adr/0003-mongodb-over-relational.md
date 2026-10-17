# ADR 0003 — MongoDB over a Relational Database

- **Status:** Accepted
- **Date:** 2026-10-17
- **Context:** The original MVP PDF mentioned a relational database, but the
  final approved technology stack (§15.4) specifies MongoDB and prohibits
  PostgreSQL and Prisma.
- **Decision:** Use MongoDB (Atlas Free Tier initially) with Mongoose for
  application-domain collections and the MongoDB native driver for adapters that
  require it (Better Auth, Agenda v6).
- **Consequences:**
  - Fully aligned with the approved stack and the required adapters.
  - Referential integrity, cycle detection, and role-assignment rules are
    enforced **in application logic** with supporting indexes (including unique
    and partial indexes), short transactions, and optimistic concurrency.
  - Dependency-graph validation and same-project endpoint rules live in
    services, not the database engine.
  - Transaction-dependent behavior requires a replica-set-compatible environment
    for tests.
- **Alternatives considered:** PostgreSQL + Prisma (prohibited); pure driver
  without Mongoose (rejected: spec designates Mongoose for domain collections).
