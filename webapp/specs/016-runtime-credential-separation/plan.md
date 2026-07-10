# Implementation Plan: Runtime Credential Separation

**Branch**: `016-runtime-credential-separation` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-runtime-credential-separation/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Reduce production-style runtime blast radius in the starter by separating credential ownership for the Next.js app, Python worker, migration/provisioning flow, and local development. The first slice introduces explicit database URL ownership, service-specific Compose env blocks, worker/app fallback behavior, integration-secret ownership docs, and lightweight validation for wrong-runtime exposure.

## Technical Context

**Language/Version**: TypeScript 5.9 on Next.js 16 App Router, Python 3.12 worker, PowerShell validation
**Primary Dependencies**: Prisma 7, Better Auth, Docker Compose, uv-managed Python worker
**Storage**: SQLite for local development, PostgreSQL for production-style Docker deployment
**Testing**: Vitest, Python unittest/uv, `docker compose config`, existing validation scripts
**Target Platform**: Docker-first web application template with local Windows/PowerShell development
**Project Type**: Web application with background worker
**Performance Goals**: No measurable runtime overhead; validation completes in under 10 seconds for static checks
**Constraints**: Preserve simple local SQLite development and existing Docker commands
**Scale/Scope**: Small internal deployments using app, worker, and migration containers

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                 | Status | Notes                                                                                     |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Simplicity First          | PASS   | Uses env naming, docs, and small validation rather than a new secret manager abstraction. |
| Test Coverage             | PASS   | Includes focused app, worker, Compose, and validation checks.                             |
| Duplication Control       | PASS   | Replaces one broad Compose env block with clear shared/service-specific blocks.           |
| Incremental Delivery      | PASS   | Database split is MVP; integration-secret refinement and validation follow.               |
| Continuity And Handoff    | PASS   | CONTINUE.md was reviewed before planning.                                                 |
| Web Application Standards | PASS   | No UI changes; preserves existing route/auth behavior.                                    |

**Gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/016-runtime-credential-separation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-credential-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
.env.example
.env.docker.example
docker-compose.yml
src/lib/db.ts
src/lib/better-auth.ts
worker/src/starter_worker/config.py
worker/tests/test_main.py
scripts/validate-runtime-credentials.ps1
docs/security/actions.md
docs/security/followups.md
specs/base/runtime-and-ops.md
```

**Structure Decision**: Implement this as a focused hardening pass across existing runtime boundaries. Do not introduce a new deployment root or hosted-cloud-specific secret system.

## Complexity Tracking

No constitution violations or exceptional complexity waivers are required.
