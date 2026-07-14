# Tasks: Scope Access Management

**Input**: Design documents from `/specs/007-scope-access-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scope-access.md, quickstart.md

**Tests**: Not a TDD pass. Test tasks appear where a requirement is security-relevant and cannot be verified by inspection — chiefly FR-024 and FR-019 (every authorisation check holds at the API independently of the interface), which by definition cannot be tested through the UI.

**Organization**: Grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, US4 per spec.md
- All paths repo-relative; this feature lives entirely under `webapp/`

---

## Phase 1: Setup

- [ ] T001 [P] Add next-intl keys for scope assignment, the scope column, and access-related messages in `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`. Scope levels use "Bezirk"/"Verband" as proper names per feature 005's FR-022a.

**No schema task.** `UserScopeAssignment` already exists with `@@unique([userId, scopeId])`. This feature adds no migration.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T002 Create `webapp/src/services/api/scope-assignments.ts` with grant, revoke and list, following `webapp/src/services/api/user-admin.ts`'s established shape: `requireRouteUserWithRoles`, `withSerializableRetry`, `safeLogAudit`. Grant is an **upsert** on `@@unique([userId, scopeId])` so granting a held scope is a no-op rather than an error (FR-005).
- [ ] T003 Add the authorisation helper to `webapp/src/lib/rbac.ts`: may actor A grant/revoke scope S for user U? Encodes FR-021 (only scopes the actor holds), FR-022 (no role above the actor's own; equal is permitted) and FR-023 (never the actor's own assignments). **One helper, one enforcing caller** — scattering these across dialog, route and service makes "did we check?" unanswerable (research R-203).
- [ ] T004 Enforce FR-004a in `scope-assignments.ts`: only Bezirke and the Verband are assignable; the Germany root is not. Under exact-match an assignment to it grants nothing. Reuse feature 005's `lib/raster/scope-level.ts`.
- [ ] T005 [P] Unit-test the authorisation helper in `webapp/tests/unit/auth/scope-grant-authorization.test.ts`: a scope admin may grant a scope they hold; may not grant one they do not; may not grant `PLATFORM_ADMIN`; may not alter their own assignments; a platform admin may grant any assignable scope; nobody may grant Germany.

**Checkpoint**: assignments can be created and refused correctly, before anything exposes them.

---

## Phase 3: User Story 1 - Grant and revoke (Priority: P1) 🎯 MVP

**Goal**: A platform admin assigns and revokes Bezirke and the Verband through the app, and an assignment means exactly that scope.

**Independent Test**: Grant a scoped user one Bezirk; signed in as them, verify they reach exactly that Bezirk's Raster data and no other. Revoke; verify it disappears.

### Implementation

- [ ] T006 [US1] Create `webapp/src/app/api/users/[id]/scopes/route.ts`: `POST` grant, `DELETE` revoke, `GET` list (FR-001, FR-041). Thin route delegating to `scope-assignments.ts`, matching `/api/users/[id]/role`.
- [ ] T007 [US1] Remove the ancestor walk from `webapp/src/lib/raster/access.ts` — both `canAccessRasterDistrict` and `listAccessibleRasterScopes` currently match on the assignment, its parent, **or its grandparent**. An assignment grants exactly its own scope (FR-010, FR-011). Do **not** touch `checkScopeAccess` in `rbac.ts`: it is already exact-match and already correct (research R-201).
- [ ] T008 [P] [US1] Create `webapp/src/components/auth/ScopeAssignmentDialog.tsx`: assign and revoke scopes for a user, showing each scope's hierarchy position and level.
- [ ] T009 [P] [US1] Show a user's current scopes in `webapp/src/components/auth/UserManagementTable.tsx` without opening another page (FR-002).
- [ ] T010 [US1] Tell a scoped user holding no assignments that they have no scopes, rather than showing an error or a bare empty page (FR-013).
- [ ] T011 [US1] Audit every grant and revoke with actor, target user, scope and direction via the existing `safeLogAudit` (FR-030). A refused attempt records nothing and changes nothing (FR-031).
- [ ] T012 [P] [US1] Integration-test exact-match access in `webapp/tests/integration/scope-exact-match.test.ts`: a user assigned one Bezirk reaches it and no other scope (SC-002); a user assigned the Verband reaches Verband-level data and **no Bezirk beneath it** (SC-003); a platform admin reaches every scope without assignments (FR-012).
- [ ] T013 [P] [US1] Test that FR-012a already holds, in `webapp/tests/integration/last-admin-guard.test.ts`: demoting or deactivating the last active platform admin is refused with a stated reason (SC-012). **This guard already exists** — `ensureAdminUserCanChange` in `user-admin.ts`, inside a `Serializable` transaction. Do not reimplement it; nothing currently pins the behaviour, which is the gap.

**Checkpoint**: scopes can be granted through the app, and an assignment means exactly one scope everywhere.

---

## Phase 4: User Story 2 - Work in the Bezirk you were granted (Priority: P2)

**Goal**: A scope admin imports, reviews and runs in scopes they hold. A scope user sees and changes nothing.

**Independent Test**: Grant a scope admin one Bezirk. As them, import a source and start a run there — both succeed. Attempt both in a Bezirk they do not hold — both refused **by the API**, tested directly rather than through the interface.

### Implementation

- [ ] T014 [US2] Change raster API routes from `requireRasterInputSet(request, id, "admin")` to `"scheduler"` for the work: source upload/refresh/delete, input-set creation, group review, capacity edit, validation, run start, manual assignment (FR-016, FR-019). `levelRoles.scheduler` already reads `[PLATFORM_ADMIN, SCOPE_ADMIN]` — the levels need no change. **This is the enforcing half**; leave `"admin"` on anything genuinely system-level.
- [ ] T015 [US2] Replace the seven hardcoded `Role.PLATFORM_ADMIN` checks in the Raster step pages with level-based checks (FR-017). Feature 005's T024 moves them unchanged; this fixes them. The visible half — pointless without T014, and misleading without it (buttons that 403).
- [ ] T016 [US2] Keep `SCOPE_USER` at viewer: no import, edit or run controls anywhere, whatever they are assigned (FR-018, SC-011).
- [ ] T017 [P] [US2] Integration-test capability by role and scope in `webapp/tests/integration/scope-scheduler-access.test.ts`, **calling the API directly**: a scope admin holding OWL starts a run in OWL (SC-009) and is refused in Köln (SC-005); a scope user is refused everywhere (SC-011); a platform admin is unaffected. Testing through the UI would prove nothing — FR-019 is precisely about the API standing alone.

**Checkpoint**: no run in any Bezirk needs a platform admin, given that Bezirk has a scope admin (SC-010).

---

## Phase 5: User Story 3 - A Bezirk admin manages access to their own Bezirk (Priority: P3)

**Goal**: A scope admin grants and revokes access within their own scopes, and cannot escalate.

**Independent Test**: As a scope admin holding one Bezirk, grant a user that Bezirk — succeeds. Attempt a Bezirk you do not hold — refused. Attempt to grant yourself, or to grant platform admin — refused. All refusals verified at the API.

**⚠️ Task order in this phase is a safety property, not a preference.** The users page currently gates once, in the component, then loads *every* user. Widening that gate before the per-action checks exist — even for one commit — hands the directory to every Bezirk admin.

### Implementation

- [ ] T018 [US3] Wire T003's authorisation helper into `scope-assignments.ts` so every grant and revoke is checked in the **service** (FR-024). Not the route, not the dialog. The UI may ask the same helper what to offer, but this call is the enforcement.
- [ ] T019 [US3] Add a role ceiling to `webapp/src/services/api/user-admin.ts`: a scope admin may not grant a role above their own, and may not grant `PLATFORM_ADMIN` (FR-022). Granting an equal role is permitted.
- [ ] T020 [US3] Add exact-email lookup to `webapp/src/services/api/user-admin.ts` and `webapp/src/app/api/users/lookup/route.ts`: match the **full** email exactly, return at most one user, never a list (FR-026, FR-027). No prefix, no substring, no wildcard, no `LIKE`. A non-match returns a uniform "no user found" (FR-029).
- [ ] T021 [US3] Make the users page's data load actor-dependent in `webapp/src/app/(dashboard)/users/page.tsx`: platform admins get the full list (FR-028); scope admins get lookup only, never a list — not filtered, not paginated (FR-027). The page today calls `prisma.user.findMany()` unconditionally.
- [ ] T022 [US3] **Only now** widen the page gate at `webapp/src/app/(dashboard)/users/page.tsx:12` from `PLATFORM_ADMIN` to also admit `SCOPE_ADMIN` (FR-025). Depends on T018 through T021. Doing this first is a privilege escalation.
- [ ] T023 [US3] Offer scope admins no action they cannot take, in `webapp/src/components/auth/UserManagementTable.tsx` (FR-025). Presentation only — T018 is what prevents them.
- [ ] T024 [US3] Audit scope-admin grants and revokes with the acting admin recorded (FR-030).
- [ ] T025 [P] [US3] Integration-test escalation attempts in `webapp/tests/integration/scope-admin-escalation.test.ts`, **calling the API directly with the UI bypassed** (FR-024, SC-005): granting a scope not held → refused; granting `PLATFORM_ADMIN` → refused; granting oneself → refused; listing users → refused; a refused attempt alters nothing (FR-031). This is the file that proves the feature does not open a hole.
- [ ] T026 [P] [US3] Integration-test lookup in `webapp/tests/integration/user-lookup.test.ts`: an exact email returns one user; a prefix returns nothing; a non-match returns the same uniform response as a match to a user the caller may not act on (FR-027, FR-029).

**Checkpoint**: delegation works and cannot be turned into escalation.

---

## Phase 6: User Story 4 - See who has access to what (Priority: P4)

- [ ] T027 [US4] Show which users hold a given scope (FR-040), filtered to scopes the actor may see (FR-042).
- [ ] T028 [US4] Show which scopes a given user holds (FR-041).
- [ ] T029 [P] [US4] Integration-test that a scope admin sees access only for scopes they hold, in `webapp/tests/integration/scope-access-review.test.ts` (FR-042).

**Checkpoint**: "who can see OWL?" is answerable without the database (SC-008).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T030 Verify revoking access does not cancel a queued or running run in that scope (FR-032, FR-033), and that the revoked user immediately stops seeing it (FR-034, SC-013). A run is the scope's work, not the person's.
- [ ] T031 Confirm bulk assignment stays workable enough that nobody reaches for a platform-admin grant instead (FR-015). 13 assignments is the interim expression of a WTTV-wide scheduler until FR-014's successor exists — if it is tedious enough, the interim defeats itself.
- [ ] T032 [P] Verify no path grants more than another for the same user and scope (SC-004): `checkScopeAccess`, `canAccessRasterDistrict` and `listAccessibleRasterScopes` must agree after T007.
- [ ] T033 [P] Walk `specs/007-scope-access-management/quickstart.md` § "Verification against success criteria" end to end.
- [ ] T034 Run `webapp/validate.ps1` (typecheck + lint) — constitution Principle VI.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: blocks all stories.
- **US1 (Phase 3)**: the MVP.
- **US2 (Phase 4)**: independent of US1 in principle — but pointless without assignments to hold.
- **US3 (Phase 5)**: needs Phase 2's helper. **Internal order is mandatory** (T018–T021 before T022).
- **US4 (Phase 6)**: needs US1's assignments to display.
- **Polish (Phase 7)**: after the desired stories.

### Feature dependency

Depends on **005**, structurally. T004 reuses `lib/raster/scope-level.ts`; T015 replaces the seven hardcoded checks *in the step pages 005 creates* — against 004 those checks are still in one 571-line page and the task means something else. This cannot be built on 004 or `main`.

(An earlier draft called this coupling cosmetic. `/speckit.analyze` caught it. Acting on the wrong claim would have started the work on a base missing both prerequisites.)

### Within US3

T018 → T019 → T020 → T021 → **T022**. T022 last, always. The page's gate is currently the only thing preventing a non-admin from loading every user.

### Parallel Opportunities

- T005 with anything else in Phase 2.
- T008, T009 — dialog and table column are separate files.
- T012, T013 — different test files.
- T025, T026 — different test files.
- Phase 6 (US4) can proceed alongside Phase 5 by another developer.

---

## Parallel Example: User Story 1

```bash
Task: "Create ScopeAssignmentDialog in webapp/src/components/auth/ScopeAssignmentDialog.tsx"
Task: "Show current scopes in webapp/src/components/auth/UserManagementTable.tsx"
Task: "Integration-test exact-match access in webapp/tests/integration/scope-exact-match.test.ts"
Task: "Test the existing last-admin guard in webapp/tests/integration/last-admin-guard.test.ts"
```

---

## Implementation Strategy

### MVP (Phases 1–3)

Grant and revoke through the app, with an assignment meaning exactly one scope. Removes the need to edit the database, which is the whole ask.

**STOP and VALIDATE** against SC-001, SC-002, SC-003.

### Then

1. US2 → scope admins can actually work. This is where the feature stops being read-only and starts being worth having.
2. US3 → delegation. The security-sensitive part, landing on a tested foundation.
3. US4 → access review.

---

## Notes

- **This feature is mostly subtraction.** An ancestor walk and seven hardcoded checks come out. `UserScopeAssignment`, the roles, the last-admin guard and the audit mechanism all already exist.
- **T013 tests something that already works.** FR-012a is implemented (`ensureAdminUserCanChange`). The gap is that nothing pins it.
- **T022's position is the safety property of this feature.** Not its content — its position.
- **T017 and T025 must call the API directly.** FR-019 and FR-024 are exactly the claim that the UI is not the boundary. Testing through the UI would assert the opposite of what they require.
- **T007 removes the walk from `access.ts`, not from `rbac.ts`.** The temptation to "make them consistent" by adding the walk to `rbac.ts` is backwards.
- Commit after each task or logical group.
