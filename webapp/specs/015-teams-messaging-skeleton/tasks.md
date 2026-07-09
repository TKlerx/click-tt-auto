# Tasks: Teams Messaging Skeleton

**Input**: Design documents from `/specs/015-teams-messaging-skeleton/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: Constitution requires test coverage (Principle II). Test tasks included per user story.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prisma schema, shared types, TeamsClient abstraction, env config

- [x] T001 Add TeamsMessageStatus and TeamsInboundStatus enums plus TeamsIntegrationConfig, TeamsDeliveryTarget, TeamsOutboundMessage, TeamsIntakeSubscription, and TeamsInboundMessage models to prisma/schema.prisma per data-model.md
- [x] T002 Run `pnpm run prisma:migrate` to generate migration, then `pnpm run prisma:generate` to update Prisma client
- [x] T003 [P] Create Teams types and TeamsClient interface in src/lib/teams/types.ts per data-model.md and contracts/api.md
- [x] T004 [P] Add TEAMS_ENABLED and TEAMS_POLL_INTERVAL_SECONDS to .env.example with defaults (false, 60)
- [x] T005 Add `teams_message_delivery` and `teams_intake_poll` to allowed job types in src/services/api/background-jobs.ts
- [x] T006 Implement TeamsClient Graph API wrapper (sendChannelMessage, listChannelMessages, getChannelMessagesDelta) in src/lib/teams/client.ts — reuse token caching pattern from src/lib/mail/graph.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Service layer and worker infrastructure that all user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement Teams admin service (getOrCreateConfig, updateConfig) in src/services/teams/admin.ts — singleton pattern for TeamsIntegrationConfig
- [x] T008 [P] Add Teams translation keys for all 5 locales (en, de, es, fr, pt) in src/i18n/messages/{locale}.json — keys for integration settings, targets, subscriptions, status labels, error messages
- [x] T009 [P] Create graph_teams.py in worker/src/starter_worker/graph_teams.py — send_teams_channel_message() and list_teams_channel_messages() functions following graph_mail.py pattern
- [x] T010 Add Teams DB operations to worker/src/starter_worker/db.py — CRUD for TeamsOutboundMessage status updates, TeamsInboundMessage creation, TeamsIntakeSubscription delta token updates, has_teams_inbound_message() dedup check

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Send Operational Messages To Teams (Priority: P1) MVP

**Goal**: Platform admin configures Teams destination, system sends outbound notifications to Teams channels via background jobs

**Independent Test**: Configure one delivery target, trigger USER_CREATED event, confirm message in Teams channel with delivery record in admin view

### Tests for User Story 1

- [x] T011 [P] [US1] Unit test for TeamsClient.sendChannelMessage in tests/unit/teams-client.test.ts — mock Graph API responses (success, 4xx, 5xx, timeout)
- [x] T012 [P] [US1] Unit test for Teams outbound service (queueTeamsMessages, message truncation at 28KB) in tests/unit/teams-service.test.ts
- [x] T013 [P] [US1] Unit test for delivery target CRUD and config management in tests/unit/teams-admin.test.ts

### Implementation for User Story 1

- [x] T014 [US1] Implement Teams outbound service in src/services/teams/service.ts — queueTeamsMessages(eventType, eventId, payload) creates TeamsOutboundMessage + BackgroundJob per active target, checks sendEnabled flag, truncates content at 28KB
- [x] T015 [US1] Add teams_message_delivery job handler to worker/src/starter_worker/main.py — call send_teams_channel_message(), update TeamsOutboundMessage status (SENDING→SENT or RETRYING→FAILED), follow notification_delivery pattern
- [x] T016 [US1] Hook Teams outbound into existing notification event pipeline — call safeQueueTeamsMessages() from src/services/notifications/service.ts alongside email queueing, gated on TEAMS_ENABLED and sendEnabled
- [x] T017 [P] [US1] Implement GET/POST /api/integrations/teams/targets in src/app/api/integrations/teams/targets/route.ts — list targets, create target with unique(teamId,channelId) constraint, PLATFORM_ADMIN required
- [x] T018 [P] [US1] Implement PUT/DELETE /api/integrations/teams/targets/[id] in src/app/api/integrations/teams/targets/[id]/route.ts — update name/active, delete with pending message check (409)
- [x] T019 [P] [US1] Implement GET/PUT /api/integrations/teams config endpoints in src/app/api/integrations/teams/route.ts — get config with health metrics, update sendEnabled/intakeEnabled toggles
- [x] T020 [US1] Build Teams admin UI — delivery targets section in src/app/(dashboard)/admin/integrations/teams/page.tsx — send toggle, target list with add/edit/delete, toast feedback, responsive layout, all text via next-intl

- [x] T020a [US1] E2E test for US1 happy path in tests/e2e/teams-integration.spec.ts — admin configures target, triggers USER_CREATED event, verifies outbound message queued with delivery record visible in status view (mock Graph API at network level)

**Checkpoint**: US1 complete — outbound Teams messaging functional end-to-end

---

## Phase 4: User Story 2 — Read Teams Conversation Updates (Priority: P2)

**Goal**: Platform admin enables read-only intake for selected Teams conversations, system polls and ingests messages without replying

**Independent Test**: Enable intake for one conversation, post message in Teams, wait for poll cycle, confirm inbound record visible in admin view

### Tests for User Story 2

- [x] T021 [P] [US2] Unit test for Teams intake service (processTeamsIntakePoll, dedup, delta token handling) in tests/unit/teams-service.test.ts (extend existing file)
- [x] T022 [P] [US2] Unit test for worker teams_intake_poll handler in worker/tests/test_main.py (extend existing file)

### Implementation for User Story 2

- [x] T023 [US2] Implement Teams intake service in src/services/teams/intake.ts — processTeamsIntakePoll() fetches messages via delta query per active subscription, dedup via providerMessageId, stores TeamsInboundMessage, updates deltaToken and lastPolledAt
- [x] T024 [US2] Add teams_intake_poll job handler to worker/src/starter_worker/main.py — iterate active subscriptions, call list_teams_channel_messages() with delta token, store new messages via db.py, update subscription delta token
- [x] T025 [US2] Create periodic teams_intake_poll job scheduling in worker/src/starter_worker/main.py — worker main loop creates a teams_intake_poll BackgroundJob on TEAMS_POLL_INTERVAL_SECONDS interval if no pending poll job exists, gated on TEAMS_ENABLED and intakeEnabled, matching inbound_mail_poll self-scheduling pattern
- [x] T026 [P] [US2] Implement GET/POST /api/integrations/teams/subscriptions in src/app/api/integrations/teams/subscriptions/route.ts — list subscriptions, create with unique(teamId,channelId), PLATFORM_ADMIN required
- [x] T027 [P] [US2] Implement PUT/DELETE /api/integrations/teams/subscriptions/[id] in src/app/api/integrations/teams/subscriptions/[id]/route.ts — update active status, delete (retain inbound messages)
- [x] T028 [US2] Extend Teams admin UI with intake subscriptions section in src/app/(dashboard)/admin/integrations/teams/page.tsx — intake toggle, subscription list with add/edit/delete, last polled timestamp display

**Checkpoint**: US2 complete — inbound Teams message intake functional, independently testable

---

## Phase 5: User Story 3 — Manage Teams Integration Safety Controls (Priority: P3)

**Goal**: Platform admin views integration health, delivery/intake outcomes, and can emergency-disable integration

**Independent Test**: View status dashboard with recent activity, disable Teams integration, verify no new sends or reads occur

### Tests for User Story 3

- [x] T029 [P] [US3] Unit test for status endpoint (activity aggregation, health metrics computation) in tests/unit/teams-admin.test.ts (extend existing file)

### Implementation for User Story 3

- [x] T030 [US3] Implement status aggregation in src/services/teams/admin.ts — getIntegrationStatus() returns lastSuccessfulSend, lastSuccessfulIntake, recentSendFailures, recentIntakeFailures, recentActivity list
- [x] T031 [US3] Implement GET /api/integrations/teams/status in src/app/api/integrations/teams/status/route.ts — recent activity log with limit and type filter per contracts/api.md
- [x] T032 [US3] Extend Teams admin UI with status/health dashboard section in src/app/(dashboard)/admin/integrations/teams/page.tsx — health indicators, recent activity table, failure highlighting, emergency disable buttons

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, validation, documentation

- [x] T033 [P] Handle edge case: message content exceeds 28KB — verify truncation + flag in TeamsOutboundMessage, log warning in worker
- [x] T034 [P] Handle edge case: Teams destination invalid/inaccessible — verify retry 3x then permanent fail, error surfaced in status view
- [x] T035 [P] Handle edge case: insufficient tenant permissions for one capability — verify send and intake degrade independently, surface permission errors in status
- [x] T036 [P] Add Teams worker tests for graph_teams.py in worker/tests/test_main.py — mock Graph API for send and list, verify retry behavior
- [x] T037 Update .env.example with all Teams-related env vars and comments
- [x] T038 Run quickstart.md validation — walk through setup steps, verify end-to-end flow, time setup to verify SC-004 (under 10 minutes)
- [x] T039 Update CONTINUE.md, CONTINUE_LOG.md, and ACTIVE_SPECS.md with Teams integration completion status per constitution Principle VI
- [x] T040 [P] Add FR-011 negative constraint test in tests/unit/teams-client.test.ts — assert TeamsClient exposes no reply, update, or delete methods; assert worker handlers never call Graph write endpoints beyond sendChannelMessage
- [x] T041 [P] Add FR-012 regression test in tests/unit/teams-service.test.ts — trigger notification event with Teams disabled, verify email notification still queued unchanged
- [x] T042 [P] Verify test coverage includes new src/lib/teams/, src/services/teams/, and worker/src/starter_worker/graph_teams.py — ensure coverage does not decrease per constitution Principle II

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001, T002 must complete for Prisma client)
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 2 completion. Can run parallel to US1 but shares admin.ts and page.tsx
- **US3 (Phase 5)**: Depends on Phase 2 completion. Benefits from US1+US2 data but independently testable
- **Polish (Phase 6)**: Depends on US1+US2+US3

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no dependency on other stories
- **US2 (P2)**: After Phase 2 — independent from US1 (shared config model is in Phase 2)
- **US3 (P3)**: After Phase 2 — reads data created by US1/US2 but status view works with empty state

### Within Each User Story

- Tests written and failing before implementation
- Models/schema before services
- Services before API routes
- API routes before UI
- Core implementation before integration hooks

### Parallel Opportunities

- T003, T004 parallel (different files)
- T008, T009 parallel (TS vs Python, different files)
- T011, T012, T013 parallel (different test files)
- T017, T018, T019 parallel (different API route files)
- T021, T022 parallel (different test files)
- T026, T027 parallel (different API route files)
- T033, T034, T035, T036 parallel (independent edge cases)

---

## Parallel Example: User Story 1

```text
# Tests in parallel:
T011: Unit test TeamsClient in tests/unit/teams-client.test.ts
T012: Unit test outbound service in tests/unit/teams-service.test.ts
T013: Unit test admin CRUD in tests/unit/teams-admin.test.ts

# API routes in parallel (after T014 service):
T017: GET/POST targets in src/app/api/integrations/teams/targets/route.ts
T018: PUT/DELETE targets in src/app/api/integrations/teams/targets/[id]/route.ts
T019: GET/PUT config in src/app/api/integrations/teams/route.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema, types, client)
2. Complete Phase 2: Foundational (admin service, translations, worker infra)
3. Complete Phase 3: User Story 1 (outbound send)
4. **STOP and VALIDATE**: Configure target, trigger event, confirm Teams message delivered
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test outbound → Deploy (MVP!)
3. Add US2 → Test intake → Deploy
4. Add US3 → Test status/controls → Deploy
5. Polish → Edge cases, docs → Final deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Constitution Principle II: All stories have test tasks
- Constitution Principle IX: All UI text via next-intl keys
