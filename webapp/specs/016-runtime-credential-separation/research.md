# Research: Runtime Credential Separation

## Decision 1: Use Runtime-Specific Database URL Variables

**Decision**: Introduce `APP_DATABASE_URL`, `WORKER_DATABASE_URL`, and `MIGRATION_DATABASE_URL`, while retaining `DATABASE_URL` as a local-development and transition fallback.

**Rationale**: The current starter shares `DATABASE_URL` across app, worker, and migration services. Separate variable names make ownership explicit without requiring an immediate database role/grant implementation in every environment.

**Alternatives Considered**:

- Keep only `DATABASE_URL`: simplest, but hides privilege boundaries and lets migration-level credentials leak into app runtime.
- Require separate Postgres roles immediately: stronger security, but too much operational burden for the starter's first hardening slice.

## Decision 2: Keep Local Development Pragmatic

**Decision**: Local development may continue using `DATABASE_URL=file:./dev.db`, and the worker may keep a fallback to that value outside production-style runs.

**Rationale**: The starter's fast local setup is important. The hardening target is production-style and hosted runtime blast-radius reduction, not making local SQLite cumbersome.

**Alternatives Considered**:

- Require all three database URLs locally: clearer separation, but needless friction when all contexts point at one local SQLite file.

## Decision 3: Split Compose Environment Blocks By Service

**Decision**: Replace the single broad `x-app-env` application to every service with common, app, worker, and migration-specific environment blocks.

**Rationale**: Compose is the main production-style runtime in this template. Service-specific env blocks give immediate assurance about what each container receives.

**Alternatives Considered**:

- Keep the shared block and rely on docs: low effort, but does not enforce the boundary.
- Create separate Compose files: more moving pieces than needed for this focused slice.

## Decision 4: Document Graph Credential Exceptions

**Decision**: Classify Azure SSO, Graph mail, and Teams credentials by runtime owner, but allow a documented exception for small deployments that intentionally reuse one app registration.

**Rationale**: The template currently supports SSO, mail, and Teams flows with overlapping Microsoft identity values. Some tenants will reuse app registrations. The useful improvement is making this explicit and avoiding unnecessary secrets in runtimes that do not need them.

**Alternatives Considered**:

- Force separate app registrations: stronger but too prescriptive for a reusable starter.
- Ignore integration secrets in this spec: misses a real blast-radius concern already present in the template.

## Decision 5: Add Lightweight Static Validation

**Decision**: Add a repository-local validation script focused on env ownership and obvious wrong-runtime exposure, then wire it into documented validation.

**Rationale**: The template already values deterministic checks. A lightweight script can prevent regression without needing live cloud access.

**Alternatives Considered**:

- Manual review only: likely to drift.
- Heavy policy engine: unnecessary for this repository size.
