# Implementation Plan: Ops Health Dashboard

**Branch**: `021-ops-health-dashboard` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-ops-health-dashboard/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Add an administrator-only Ops Health Dashboard inside the existing dashboard/admin navigation. The first version presents a read-only point-in-time health snapshot gathered on page load or manual refresh, combining existing build metadata, runtime/database checks, configuration sanity, recent worker evidence, and recent deployment smoke evidence where available. It also provides a copyable non-secret diagnostic summary. The implementation should reuse existing health/version/background-job patterns, avoid new persistent storage unless a recorded smoke/job signal already exists, and keep all diagnostic output secret-safe.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16 App Router, React 19  
**Primary Dependencies**: Existing Next.js server components/API routes, Prisma 7, Better Auth role/session helpers, next-intl, lucide-react, existing monitoring and app-version helpers  
**Storage**: Existing Prisma database only; no new tables planned. Use existing background job records for worker evidence and existing deployment/runtime metadata when available.  
**Testing**: Vitest unit/integration tests, Playwright e2e for administrator dashboard access and copy interaction, existing `validate.ps1`/`pnpm` validation pipeline  
**Target Platform**: Web application running locally, in Docker, and on Azure Container Apps  
**Project Type**: Next.js web application with server-rendered dashboard pages and API routes  
**Performance Goals**: Healthy snapshot visible within 5 seconds; health checks bounded so one slow/degraded area does not make the dashboard unusable  
**Constraints**: Admin-only access; no raw secrets, tokens, passwords, private keys, or full connection strings in UI/API/copy output; configuration sanity checks report presence/readiness only for authentication, database URL ownership, runtime environment, and build metadata; all user-facing text via next-intl; responsive layout; configurable base path respected; user-triggered copy actions provide toast-style feedback  
**Scale/Scope**: Small-team operational page for roughly 10 users and single-instance deployments

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Simplicity First**: PASS. Reuse existing app-version, monitoring, role auth, background job, navigation, and i18n patterns. No new dependency or persistence layer.
- **Test Coverage**: PASS. Plan includes unit tests for snapshot/sanitization/status aggregation, route/page auth tests, and e2e coverage for the admin flow.
- **Duplication Control**: PASS. Shared status/snapshot formatting should live in a small service/module rather than duplicating logic between route, page, and copy summary.
- **Incremental Delivery**: PASS. User Story 1 can ship first with metadata and admin navigation; User Story 2 adds health checks; User Story 3 adds copyable diagnostics.
- **Spec Sequencing And Completion**: PASS. `020` is fully implemented, `021` is the active spec, and `ACTIVE_SPECS.md` will be updated.
- **Continuity And Handoff**: PASS. `CONTINUE.md` was reviewed and will be updated with planning state.
- **Azure OpenAI Integration**: PASS. No LLM functionality is introduced.
- **Web Application Standards**: PASS. Dashboard remains under the existing app shell and base-path-aware routing.
- **Web Application Standards**: PASS. Dashboard remains under the existing app shell and base-path-aware routing, and copy actions require toast-style feedback.
- **Internationalization**: PASS. New labels, statuses, messages, and copy feedback require keys for en/de/es/fr/pt.
- **Responsive Design**: PASS. Plan requires mobile/tablet/desktop layout verification.

## Project Structure

### Documentation (this feature)

```text
specs/021-ops-health-dashboard/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ops-health-dashboard.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Created by /speckit.tasks, not by this plan
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (dashboard)/
│   │   └── admin/
│   │       └── ops/
│   │           └── page.tsx
│   └── api/
│       └── admin/
│           └── ops-health/
│               └── route.ts
├── components/
│   └── ops/
│       ├── DiagnosticSummaryCopy.tsx
│       ├── HealthStatusBadge.tsx
│       └── OpsHealthDashboard.tsx
├── lib/
│   └── ops-health.ts
└── i18n/
    └── messages/
        ├── en.json
        ├── de.json
        ├── es.json
        ├── fr.json
        └── pt.json

tests/
├── e2e/
│   └── ops-health/
│       └── admin-ops-health.spec.ts
├── integration/
│   └── ops-health-api.test.ts
└── unit/
    └── ops-health.test.ts
```

**Structure Decision**: Use the existing Next.js App Router dashboard structure. The user-facing page belongs under the administrator area, the JSON snapshot route belongs under `/api/admin`, and shared snapshot/status/sanitization logic belongs in `src/lib/ops-health.ts` so tests and UI do not duplicate operational rules.

## Phase 0: Research Summary

See [research.md](./research.md). All planning questions are resolved with conservative defaults:

- Snapshot checks are point-in-time and manually refreshable.
- Worker/deploy smoke evidence is displayed only when recently recorded evidence exists.
- Diagnostic output is allowlisted and redacted by default.
- No new storage is added for the first version.

## Phase 1: Design Summary

See [data-model.md](./data-model.md), [contracts/ops-health-dashboard.md](./contracts/ops-health-dashboard.md), and [quickstart.md](./quickstart.md).

The design centers on four in-memory view models:

- `EnvironmentIdentity`
- `HealthCheckResult`
- `HealthSnapshot`
- `DiagnosticSummary`

## Post-Design Constitution Check

- **Simplicity First**: PASS. Design remains a small page, route, and service around existing primitives.
- **Test Coverage**: PASS. Artifacts define unit, integration, and e2e checks for each story.
- **Duplication Control**: PASS. Snapshot derivation and redaction have one owner.
- **Incremental Delivery**: PASS. Tasks can be generated by story priority.
- **Continuity And Handoff**: PASS. Active spec and next action are recorded.
- **Internationalization / Responsive Design**: PASS. Quickstart and contract call out locale keys and viewport checks.

## Complexity Tracking

No constitution violations or added complexity require justification.
