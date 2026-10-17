# ADR 0001 — Pin TypeScript to ^6.0.3

- **Status:** Accepted
- **Date:** 2026-10-17
- **Context:** The approved stack requires TypeScript strict mode plus
  `typescript-eslint`. The current `typescript-eslint` release (`8.71.2`)
  declares a peer dependency of `typescript >=4.8.4 <6.1.0`. TypeScript 7.x is
  therefore incompatible with the approved lint tooling.
- **Decision:** Pin the workspace to TypeScript `^6.0.3`. This satisfies both
  strict compilation and the `typescript-eslint` peer range.
- **Consequences:**
  - Linting and type checking work together without `--force`/overrides.
  - TypeScript 7 features are unavailable until `typescript-eslint` widens its
    peer range.
  - The `package.json` ranges must be revisited when `typescript-eslint` supports
    TypeScript 7.
- **Alternatives considered:** Installing TypeScript 7 with pnpm peer overrides
  (rejected: unsupported and risks lint failures); dropping `typescript-eslint`
  (rejected: linting is a required quality gate).
