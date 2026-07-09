# Implementation Plan: Teams Messaging Skeleton

**Branch**: `015-teams-messaging-skeleton` | **Date**: 2026-04-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-teams-messaging-skeleton/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Add Microsoft Teams integration to send operational notifications to Teams channels and read messages from approved Teams conversations. Uses Microsoft Graph API with application permissions, extending the existing Azure AD credentials. Follows the same worker/background-job pattern established by email notifications (spec 014). Skeleton scope: no replies, no webhooks, polling-only intake.

## Technical Context

**Language/Version**: TypeScript (Next.js 16 App Router) + Python 3.12 (worker)
**Primary Dependencies**: Microsoft Graph API (`@microsoft/microsoft-graph-client` or raw HTTP via existing `graph.ts` pattern), Prisma 7, Next.js 16
**Storage**: SQLite (dev) / PostgreSQL (prod) via Prisma 7
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web application (Docker deployment)
**Project Type**: Web service with background worker
**Performance Goals**: 95% outbound delivery within 2 minutes (SC-001), 95% inbound ingestion within 5 minutes (SC-003)
**Constraints**: ~10 users, single instance, no horizontal scaling needed
**Scale/Scope**: Small team, skeleton feature — admin-only, limited event types

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                                                             |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Simplicity First             | PASS   | Skeleton scope, reuses existing patterns (Graph client, background jobs, notification events). No new abstractions beyond TeamsClient wrapper.    |
| II. Test Coverage               | PASS   | Plan includes unit tests for TeamsClient, service layer, and worker job handlers. Integration tests for API routes.                               |
| III. Duplication Control        | PASS   | Reuses existing Graph token caching, background job infrastructure, notification event pipeline. TeamsClient follows same pattern as mail client. |
| IV. Incremental Delivery        | PASS   | Three user stories prioritized P1→P2→P3. P1 (outbound send) delivers standalone value.                                                            |
| V. Spec Sequencing              | PASS   | Specs 010–014 fully implemented. 015 is next in sequence.                                                                                         |
| VI. Continuity And Handoff      | PASS   | CONTINUE.md reviewed. Will update after planning.                                                                                                 |
| VII. Azure OpenAI Integration   | N/A    | No AI features in this spec.                                                                                                                      |
| VIII. Web Application Standards | PASS   | UI under Settings → Integrations → Teams. Base path respected. Toast feedback for actions.                                                        |
| IX. Internationalization        | PASS   | All UI text via next-intl translation keys. 5 locales.                                                                                            |
| X. Responsive Design            | PASS   | Admin settings page follows existing responsive patterns.                                                                                         |

**Gate result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/015-teams-messaging-skeleton/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                           # New enums + models for Teams

src/
├── app/
│   ├── (dashboard)/
│   │   └── admin/
│   │       └── integrations/
│   │           └── teams/
│   │               └── page.tsx            # Teams admin UI (P1+P2+P3)
│   └── api/
│       └── integrations/
│           └── teams/
│               ├── route.ts                # GET/PUT integration config
│               ├── targets/
│               │   ├── route.ts            # GET/POST delivery targets
│               │   └── [id]/
│               │       └── route.ts        # PUT/DELETE single target
│               ├── subscriptions/
│               │   ├── route.ts            # GET/POST intake subscriptions
│               │   └── [id]/
│               │       └── route.ts        # PUT/DELETE single subscription
│               └── status/
│                   └── route.ts            # GET integration health/status
├── lib/
│   └── teams/
│       ├── client.ts                       # TeamsClient abstraction (Graph API)
│       └── types.ts                        # Teams-specific types
├── services/
│   └── teams/
│       ├── service.ts                      # Queue outbound Teams messages
│       ├── intake.ts                       # Process inbound Teams poll
│       └── admin.ts                        # Integration config management
└── i18n/
    └── messages/
        ├── en.json                         # Teams translation keys
        ├── de.json
        ├── es.json
        ├── fr.json
        └── pt.json

worker/src/starter_worker/
├── main.py                                 # Add teams_message_delivery + teams_intake_poll handlers
├── graph_teams.py                          # Teams Graph API calls (send message, list messages)
└── db.py                                   # Add Teams DB operations

tests/
├── unit/
│   ├── teams-client.test.ts
│   ├── teams-service.test.ts
│   └── teams-admin.test.ts
└── e2e/
    └── teams-integration.spec.ts
```

**Structure Decision**: Follows existing patterns — `lib/teams/` mirrors `lib/mail/`, `services/teams/` mirrors `services/notifications/`, worker gets parallel `graph_teams.py`. API routes under `/api/integrations/teams/` for clean namespace separation from notifications.

## Complexity Tracking

> No constitution violations — this section is empty by design.
