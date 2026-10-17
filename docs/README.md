# Documentation

This directory is the permanent source of truth for the Interscale Marketing
Project & Team Management System. It is preserved verbatim from the approved
requirements and must be kept in sync with any approved change.

## Source documents

- The **original Project Management MVP Version 1.1 (dated 16 October 2026)**,
  the **updated authentication specification**, and the **final technology
  stack** were provided as text in the OpenCode conversation that started this
  project. Those source PDFs/Markdown files are **not physically present in
  this repository** and were never copied from disk. The complete text that was
  provided is preserved verbatim in [00-product-requirements.md](./00-product-requirements.md).
- If the original PDF(s) are later added to the repository, this documentation
  must be reconciled against them and any conflict reported rather than
  silently resolved.

## Index

| Document | Purpose |
| --- | --- |
| [00-product-requirements.md](./00-product-requirements.md) | Complete master product specification (preserved verbatim). |
| [01-technology-stack.md](./01-technology-stack.md) | Final approved technology stack and prohibited technologies. |
| [02-authentication.md](./02-authentication.md) | Authentication specification (Better Auth, bootstrap, account lifecycle). |
| [03-authorization.md](./03-authorization.md) | Access levels, functional job roles, capability model, permission matrix. |
| [04-data-model.md](./04-data-model.md) | MongoDB collections, relationships and indexes (Phases 1–4). |
| [05-api.md](./05-api.md) | REST API plan (Phases 1–4). |
| [06-frontend.md](./06-frontend.md) | Frontend screen plan (Phases 1–4). |
| [07-development-phases.md](./07-development-phases.md) | The seven delivery phases and acceptance criteria. |
| [08-testing-strategy.md](./08-testing-strategy.md) | Testing approach and Phase 1–4 test records. |
| [09-deployment.md](./09-deployment.md) | AWS EC2, Nginx, PM2, HTTPS deployment plan. |
| [decisions.md](./decisions.md) | Approved decisions log (final Phase 1–4 clarifications). |
| [traceability.md](./traceability.md) | Requirement IDs and phase traceability checklist. |
| [adr/](./adr) | Architecture Decision Records. |

## Priority when requirements conflict

1. Final approved technology stack.
2. Revised authentication specification.
3. Original Project Management MVP requirements.

If two specifications conflict, the conflict must be identified and clarified
rather than silently resolved.
