# Implementation Plan: Logging Standardization

**Branch**: `019-logging-standardization` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-logging-standardization/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Standardize operational logging across the Next.js app and Python worker by extending the existing structured logger rather than introducing a new observability platform. The implementation will define a shared event contract, keep important operational events enabled by default, make request completion logging explicit opt-in, redact sensitive metadata recursively, avoid raw actor identity/URL/query leakage, and add guardrails that block ad hoc production `console.*` logging in app and worker paths.

## Technical Context

**Language/Version**: TypeScript 5.9 on Next.js 16 App Router with React 19; Python 3.12 worker; PowerShell/Node validation scripts  
**Primary Dependencies**: Existing `src/lib/logger.ts`, `src/proxy.ts`, `src/instrumentation.ts`, Prisma-backed services, Python stdlib `logging`/`json`, Vitest, Playwright, existing validation scripts  
**Storage**: No new storage; operational logs remain process output; audit records remain Prisma-backed and separate  
**Testing**: Vitest unit tests for logger/request/service guardrails; Python worker unit tests where available; validation script coverage for console guard; existing `validate.ps1`/`pnpm run validate` flow  
**Target Platform**: Next.js Node runtime in local/Docker/shared deployments; Python worker container/process; GitHub Actions CI  
**Project Type**: Web application plus background worker  
**Performance Goals**: Bounded metadata sanitization and request completion measurement with negligible application overhead; no blocking network logging path  
**Constraints**: No new hosted logging dependency; no raw secrets, emails, display names, full URLs, or arbitrary query strings in operational logs; request logs disabled unless explicitly enabled; operational logs do not replace audit records  
**Scale/Scope**: Small-team single-instance app; scoped to production app/worker source paths and validation/docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Simplicity First**: PASS. Extend the existing TypeScript logger and use Python stdlib logging instead of adding a logging platform or dependency.
- **Test Coverage**: PASS. Tasks must include unit tests for redaction, actor identity, request completion metadata, query sanitization, worker structured output, and validation guardrails.
- **Duplication Control**: PASS. Logging conventions live in one documented contract, with shared helpers in each runtime only where needed.
- **Incremental Delivery**: PASS. P1 app logging can ship independently, followed by P2 worker parity and P3 docs/validation.
- **Spec Sequencing And Completion**: RECORDED WARNING. `ACTIVE_SPECS.md` still lists 018 OpenTofu Azure Infrastructure. The user explicitly continued with 019 after the infra audit/cleanup discussion; this plan records the overlap and keeps 018 visible.
- **Continuity And Handoff**: PASS. `CONTINUE.md` was reviewed; plan output will update continuity artifacts after generation.
- **Azure OpenAI Integration**: N/A. This feature does not add LLM functionality.
- **Web Application Standards**: PASS. No route/base-path changes; request path logging must respect sanitized paths.
- **Internationalization**: N/A. No new user-facing UI text is planned.
- **Responsive Design**: N/A. No UI layout changes are planned.

## Project Structure

### Documentation (this feature)

```text
specs/019-logging-standardization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── logging-contract.md
│   └── validation-contract.md
└── tasks.md              # Created by /speckit.tasks, not by this plan
```

### Source Code (repository root)

```text
src/
├── instrumentation.ts              # Process-level operational events
├── proxy.ts                        # Request correlation and optional request completion logs
├── lib/
│   ├── logger.ts                   # Structured logger, redaction, request helpers
│   └── audit.ts                    # Must remain audit-specific and separate
└── services/
    ├── api/tokens.ts               # Replace ad hoc production console logging
    ├── notifications/service.ts    # Replace ad hoc production console logging
    └── teams/service.ts            # Replace ad hoc production console logging

worker/
└── src/starter_worker/
    ├── main.py                     # Worker job lifecycle structured logs
    ├── graph_mail.py               # Error text safety considered through worker logger
    └── graph_teams.py              # Error text safety considered through worker logger

tests/
├── unit/
│   ├── logger.test.ts
│   ├── logging-conventions.test.ts
│   └── proxy-request-logging.test.ts
└── ...

scripts/
├── check-*.mjs                    # Existing quality/validation helpers
└── update-continuity.mjs          # Continuity state update hook
```

**Structure Decision**: Use the existing app/worker layout. Keep logging helpers close to their runtime (`src/lib/logger.ts` for TypeScript, a small worker helper under `worker/src/starter_worker/` if needed) and document the shared contract under the feature spec.

## Complexity Tracking

No constitution violations requiring added complexity.

## Post-Design Constitution Re-check

- **Simplicity First**: PASS. Design artifacts retain a two-runtime helper approach without new infrastructure.
- **Test Coverage**: PASS. Contract and quickstart define the minimum automated checks required before implementation completion.
- **Duplication Control**: PASS. Cross-runtime duplication is limited to runtime-specific serialization/redaction primitives; event shape remains contract-driven.
- **Incremental Delivery**: PASS. P1/P2/P3 can be implemented and validated in order.
- **Continuity And Handoff**: PASS. Plan generation includes spec overview and continuity updates.
