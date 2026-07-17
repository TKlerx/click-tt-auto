# Testing And Quality

## Purpose

This document summarizes how quality is enforced across the starter.

## Testing Layers

### Unit Tests

Tooling:

- Vitest

Coverage focus:

- auth helpers
- RBAC rules
- route authorization
- audit logic
- health logic
- background jobs route
- background jobs dashboard page

### End-To-End Tests

Tooling:

- Playwright

Coverage focus:

- local login
- logout
- SSO login behavior
- revoked access handling
- theme persistence
- user management flow
- RBAC enforcement
- background jobs admin dashboard

### Python Worker Tests

Tooling:

- Python `unittest`

Coverage focus:

- worker job processing
- PostgreSQL claim / complete / fail transitions, run against a real database
  built from the Prisma migrations (`WORKER_TEST_DATABASE_URL`)

## Validation Pipeline

```mermaid
flowchart TD
    Start[validate.ps1]
    Typecheck[Typecheck]
    Lint[Lint]
    Duplication[Duplication]
    Semgrep[Semgrep]
    Utf8[UTF-8 Check]
    Cooldown[Dependency Cooldown Check]
    Trivy[Trivy Supply-Chain Audit]
    Unit[Vitest]
    E2E[Playwright]
    Continuity[Continuity]

    Start --> Typecheck
    Typecheck --> Lint
    Lint --> Duplication
    Duplication --> Semgrep
    Semgrep --> Utf8
    Utf8 --> Cooldown
    Cooldown --> Trivy
    Trivy --> Unit
    Unit --> E2E
    Unit --> Continuity
```

## Validation Modes

### `all`

Fast default validation:

- typecheck
- lint
- duplication
- semgrep
- UTF-8 validation
- dependency cooldown support validation
- unit tests

### `full`

Heavier validation:

- everything in `all`
- Trivy supply-chain audit for app, migration, worker, Docker/Compose, and OpenTofu artifacts
- Playwright E2E tests
- production dependency audit

### `continuity`

- checks whether `CONTINUE.md` / `CONTINUE_LOG.md` require refresh

### `commit`

- runs validation
- refreshes and stages continuity files
- then performs commit flow

## Dependency Safety Gates

### pnpm

- must honor `min-release-age`
- repo config requires `min-release-age=7`

### uv

- must support `--exclude-newer`
- worker config requires `exclude-newer = "1 week"`

### Trivy

- scanner image must be pinned by `sha256` digest
- scanner image release timestamp must be at least 7 days old
- app, migration, and worker runtime image scans block on fixable High/Critical findings
- runtime image scans ignore unfixed distro findings until an upstream fix exists
- Azure OpenTofu, Dockerfile, and Compose config scans block on High/Critical findings

## Quality Expectations

- no failing typecheck
- no failing lint
- no blocking semgrep findings
- no invalid UTF-8 in tracked/untracked text candidates
- no unsupported dependency-tooling environment

## Residual Risks

Even when the baseline validation passes, the following still deserve conscious attention:

- Docker runtime behavior
- production PostgreSQL migration behavior
- worker concurrency semantics under real load
- product-specific behavior added in derived repos
