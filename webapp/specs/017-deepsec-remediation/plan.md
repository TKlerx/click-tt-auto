# Implementation Plan: DeepSec Remediation

**Branch**: `017-deepsec-remediation` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-deepsec-remediation/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Remediate the refreshed DeepSec production/runtime findings in two priorities. Phase 1 fixes all unresolved HIGH and HIGH_BUG findings: delegated Graph token exposure through background jobs, release workflow supply-chain pinning and permission scope, audit export/list bounds, login rate-limit client identity, and atomic last-admin protections. Phase 2 will account for the remaining MEDIUM and BUG findings under the same spec unless task planning shows a separate spec is cleaner.

The implementation should stay close to existing Next.js, Prisma, Better Auth, worker, and GitHub Actions patterns. It should prefer small focused changes, regression tests for each security invariant, and refreshed DeepSec exports as validation evidence.

## Technical Context

**Language/Version**: TypeScript 5.9 on Next.js 16 App Router, React 19, Python 3.12 worker where affected, PowerShell validation scripts
**Primary Dependencies**: Prisma 7, Better Auth, Zod, Vitest, Playwright, GitHub Actions, GoReleaser, DeepSec 2.0.12
**Storage**: SQLite for local development, PostgreSQL for Docker/shared deployments; background job and audit data persisted via Prisma models
**Testing**: Vitest unit/integration tests, Playwright E2E where auth flow coverage is needed, `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, targeted DeepSec scan/revalidation
**Target Platform**: Docker-capable web application template with local Windows/PowerShell development and GitHub release automation
**Project Type**: Web application with API routes, background worker, CLI support, and release workflow
**Performance Goals**: Security hardening adds no visible delay to ordinary job listing/login/admin flows; audit export/list operations stay bounded by configured safe maxima
**Constraints**: Preserve existing user-facing workflows except where unsafe operations must be rejected, truncated, redacted, or explicitly confirmed; no new broad secret-management subsystem; no direct exposure of delegated bearer credentials
**Scale/Scope**: Small internal deployments, roughly 10 users, single-instance app/worker; full DeepSec export currently has 39 unresolved findings with Phase 1 focused on 4 HIGH and 6 HIGH_BUG findings

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                      | Status | Notes                                                                                                                                          |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicity First               | PASS   | Uses local redaction/cleanup, bounded queries, workflow pinning, and transactional invariants instead of introducing a new security framework. |
| Test Coverage                  | PASS   | Each Phase 1 user story maps to unit/integration/workflow validation plus refreshed DeepSec evidence.                                          |
| Duplication Control            | PASS   | Shared sanitization, bounds, and last-admin guard logic should be centralized where existing code already has service helpers.                 |
| Incremental Delivery           | PASS   | Phase 1 can ship independently from Phase 2; P1 stories are separately testable.                                                               |
| Spec Sequencing And Completion | PASS   | `ACTIVE_SPECS.md` was reviewed and lists no open specs; user explicitly moved from clarify to plan for 017.                                    |
| Continuity And Handoff         | PASS   | `CONTINUE.md` was reviewed in prior DeepSec/spec steps and is updated with current branch/spec context.                                        |
| Azure OpenAI Integration       | PASS   | No LLM runtime behavior is introduced or changed.                                                                                              |
| Web Application Standards      | PASS   | Existing API/UI behavior is preserved except security-mandated redaction, bounds, and rejection paths.                                         |
| Internationalization           | PASS   | Any new user-facing messages for audit truncation or admin rejection must use existing locale infrastructure.                                  |
| Responsive Design              | PASS   | No primary UI redesign is planned; any visible notices must fit existing responsive surfaces.                                                  |

**Gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/017-deepsec-remediation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── security-remediation-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Created later by /speckit.tasks
```

### Source Code (repository root)

```text
.github/workflows/cli-release.yml
src/app/api/background-jobs/route.ts
src/services/api/background-jobs.ts
src/services/teams/service.ts
src/app/api/audit/route.ts
src/app/api/audit/export/route.ts
src/lib/audit-export.ts
src/app/api/auth/login/route.ts
src/lib/rate-limit.ts
src/app/api/users/[id]/deactivate/route.ts
src/app/api/users/[id]/role/route.ts
src/lib/user-management.ts
src/services/api/user-admin.ts
src/app/api/auth/sso/azure/route.ts
src/services/api/cli-auth.ts
tests/unit/
tests/integration/
tests/e2e/
.deepsec/
```

**Structure Decision**: Implement 017 as a focused hardening pass across existing production/runtime boundaries. Keep Phase 1 changes in the existing route/service/helper modules and use `.deepsec/` only for scanner evidence and exports.

## Complexity Tracking

No constitution violations or exceptional complexity waivers are required.

## Phase Plan

### Phase 1 - HIGH/HIGH_BUG Remediation

1. Remove delegated Graph access tokens from background job payloads, responses, dashboard data, logs, and historical stored payloads while preserving non-secret job metadata.
2. Make last-admin status and role protections atomic for deactivation and role-change flows.
3. Bound audit listing/export behavior and clearly report truncation or required narrowing.
4. Harden login rate-limit keying so forwarded identity is used only under explicit trusted-proxy mode.
5. Split release validation from publishing, pin external workflow actions and release tooling to immutable approved versions, and keep write permission inside the publishing boundary.
6. Preserve and revalidate already fixed mock SSO and CLI browser-login security fixes.

### Phase 2 - MEDIUM/BUG Remediation

1. Generate a second task slice from the same spec after Phase 1 validation.
2. Account for all remaining MEDIUM and BUG findings as fixes, duplicates, accepted risks, or explicit deferrals with owners.
3. Refresh DeepSec exports after Phase 2 so the report no longer mixes fixed and unresolved work.

## Post-Design Constitution Check

| Principle              | Status | Notes                                                                                                         |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Simplicity First       | PASS   | Design artifacts keep changes bounded to affected services, routes, workflow, and scanner evidence.           |
| Test Coverage          | PASS   | Quickstart and contracts define targeted regression checks for every Phase 1 risk area.                       |
| Duplication Control    | PASS   | Data model calls out reusable sanitized payload and admin invariant concepts to avoid repeated ad hoc checks. |
| Incremental Delivery   | PASS   | Phase 1 and Phase 2 remain independently taskable and verifiable.                                             |
| Continuity And Handoff | PASS   | Plan completion should update `CONTINUE.md` and `CONTINUE_LOG.md`; this plan records that requirement.        |

**Post-design gate result: PASS.**
