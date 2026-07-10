# Implementation Plan: Shared Mailbox Notifications

**Branch**: `014-shared-mailbox-notifications` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-shared-mailbox-notifications/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Deliver shared-mailbox-backed email capabilities in incremental slices. Phase 1 establishes a provider-neutral mail abstraction with a Microsoft Graph implementation for listing mailbox messages, fetching a message by ID, and sending mail from a configured shared mailbox using application credentials. Later phases add event-driven notification workflows, persistence/audit, admin visibility, and inbound polling/processing.

## Technical Context

**Language/Version**: TypeScript 5.9 on Next.js 16 App Router (React 19)  
**Primary Dependencies**: Existing Next.js runtime, Prisma 7, Zod, Vitest; Microsoft Graph integration implemented with direct HTTP calls and OAuth2 client credentials  
**Storage**: No new database persistence in Phase 1; later phases will use Prisma-backed notification and inbound-email tables  
**Testing**: Vitest unit tests for the mail abstraction; integration and E2E coverage deferred until notification workflows and UI exist  
**Target Platform**: Server-side Next.js runtime plus the existing worker process for future polling  
**Project Type**: Web application with shared server-side service layer under `src/lib/`  
**Performance Goals**: Token reuse within process lifetime; mailbox list/get/send calls complete within normal Graph API latency budgets without blocking unrelated UI flows  
**Constraints**: Shared mailbox access must use app credentials, configuration is server-side only, initial provider scope is Microsoft Graph only, and the abstraction must stay open for future providers  
**Scale/Scope**: Small-team starter app with low-to-moderate notification volume and a single shared mailbox

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                | Status | Notes                                                                            |
| ------------------------ | ------ | -------------------------------------------------------------------------------- |
| I. Simplicity First      | PASS   | Start with a small provider-neutral interface and one Graph implementation       |
| II. Test Coverage        | PASS   | Phase 1 includes focused unit coverage for provider selection and Graph behavior |
| III. Duplication Control | PASS   | All mail access goes through `src/lib/mail` rather than ad hoc Graph calls       |
| IV. Incremental Delivery | PASS   | Graph mailbox access first, notifications/admin UI/inbound processing later      |
| V. Spec Sequencing       | PASS   | Builds on the existing auth, worker, and route foundations already in the repo   |
| VI. Continuity           | PASS   | `CONTINUE.md`, `CONTINUE_LOG.md`, and `ACTIVE_SPECS.md` will track the open work |
| VII. Azure OpenAI        | N/A    | No AI features in scope                                                          |
| VIII. Web Standards      | PASS   | Server-side only in Phase 1; later UI must follow existing app conventions       |
| IX. Internationalization | PASS   | Notification content and future admin UI must use the existing i18n system       |
| X. Responsive Design     | PASS   | Future notification settings/log UI must work on desktop and mobile              |

## Project Structure

### Documentation (this feature)

```text
specs/014-shared-mailbox-notifications/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- mail-service.md
`-- tasks.md
```

### Source Code

```text
src/
|-- lib/
|   `-- mail/
|       |-- index.ts
|       |-- types.ts
|       |-- provider.ts
|       `-- graph.ts
|-- services/
|   `-- api/
|       `-- ... future notification/event integration
`-- app/
    `-- ... future admin UI and route handlers

docs/
`-- mail.md

tests/
`-- unit/
    |-- mail-provider.test.ts
    `-- graph-mail.test.ts

worker/
`-- ... future inbound polling/processing integration
```

**Structure Decision**: Phase 1 lives entirely in `src/lib/mail/` so existing services can consume mail functionality without taking a dependency on Graph-specific details. Future notification workflows should build on top of this layer instead of bypassing it.

## Delivery Phases

### Phase 1: Mail Foundation

- Provider-neutral mail types and client contract
- Graph-backed mailbox list/get/send implementation
- Environment-based provider and mailbox selection
- Focused unit coverage and operator documentation

### Phase 2: Outbound Notifications

- Event-to-notification mapping for key user/admin events
- Async delivery through the existing job/worker patterns
- Notification persistence, retries, and audit visibility
- Localized email template rendering

### Phase 3: Admin Visibility and Controls

- Notification type enable/disable settings
- Notification log UI/API with RBAC-aware filtering
- Operational troubleshooting views for failures and bounces

### Phase 4: Inbound Mail Processing

- Shared mailbox polling worker
- Inbound mail persistence and deduplication
- Bounce/NDR correlation
- Reference matching and downstream routing hooks

## Risk Notes

- Microsoft Graph application permissions for shared mailboxes can be tenant-policy-sensitive, so documentation must be explicit about the required app registration and access policies.
- The current in-memory token cache is sufficient for a single process but does not coordinate across instances; this is acceptable for Phase 1 because tokens are short-lived and independently refreshable.
- Phase 1 intentionally avoids persistence and background delivery, so notification-triggering product features should not assume durable mail queues yet.
