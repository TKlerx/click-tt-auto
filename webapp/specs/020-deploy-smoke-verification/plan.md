# Implementation Plan: Deploy Smoke Verification

**Branch**: `020-deploy-smoke-verification` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-deploy-smoke-verification/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Add a repeatable Azure deployment smoke verifier that checks the deployed app health endpoint, the migration job execution result, and Container App revision health for both app and worker. Implement it as a small Node/TypeScript command with injectable command/http runners for deterministic tests, then wire it into the Azure deployment workflow after revision promotion and document local usage.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js via the existing `tsx` dev dependency  
**Primary Dependencies**: Node built-ins, existing `tsx`, Azure CLI available in deployment runners  
**Storage**: No new storage; smoke evidence remains command output and GitHub step summary  
**Testing**: Vitest unit/integration tests under `tests/unit` and `tests/integration`  
**Target Platform**: Local operator machines and GitHub Actions Ubuntu runners after Azure deployment  
**Project Type**: Web application with deployment automation and infrastructure scripts  
**Performance Goals**: Healthy smoke verification completes in under 2 minutes in normal deployment conditions  
**Constraints**: No secrets in output; fail closed on missing configuration or failed checks; no new runtime dependency  
**Scale/Scope**: One selected environment per invocation; validates one web app, one worker, and one migration job

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- Simplicity First: PASS. A single smoke command and workflow step are enough; no service or database is added.
- Test Coverage: PASS. Tasks include tests for every user story and mock external Azure/http interactions.
- Duplication Control: PASS. Shared result and redaction helpers keep repeated smoke formatting low.
- Incremental Delivery: PASS. US1 endpoint smoke is the MVP, with runtime checks and reporting layered after.
- Spec Sequencing And Completion: PASS. `ACTIVE_SPECS.md` had no older open specs before starting 020.
- Continuity And Handoff: PASS. `CONTINUE.md` was read and will be refreshed after material changes.
- Azure OpenAI Integration: PASS. No LLM functionality is introduced.
- Web Application Standards: PASS. The smoke target supports the configured base path and existing health endpoint.
- Internationalization: PASS. No user-facing app UI text is introduced.
- Responsive Design: PASS. No UI is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/020-deploy-smoke-verification/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── smoke-cli.md
└── tasks.md
```

### Source Code (repository root)

```text
scripts/
├── azure-deploy-smoke.ts
└── run-azure-deploy-smoke.mjs

tests/
├── unit/
│   └── azure-deploy-smoke.test.ts
└── integration/
    └── azure-deploy-smoke-cli.test.ts

.github/workflows/
└── deploy-azure.yml

docs/
└── azure-deploy-smoke.md
```

**Structure Decision**: Use the existing repository-level `scripts/` pattern for validation and automation commands, with tests in the existing Vitest unit/integration folders. Keep workflow integration in the existing Azure deployment workflow and add a short operator document.

## Complexity Tracking

No constitution violations require justification.

## Post-Design Constitution Check

- Simplicity First: PASS. Design remains one command plus workflow/doc wiring.
- Test Coverage: PASS. Contract includes unit and CLI tests for each user story.
- Duplication Control: PASS. The command owns check/report formatting centrally.
- Incremental Delivery: PASS. Tasks are ordered by independently testable smoke slices.
- Continuity And Handoff: PASS. Continuity updates are included in final tasks.
