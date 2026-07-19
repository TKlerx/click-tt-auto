# Tasks: Upper-League Raster Import

**Branch**: `010-upper-league-raster-import` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Tests are included: the constitution mandates coverage (Principle II), the spec carries acceptance scenarios and success criteria, and the parser already has a waiting contract test with an oracle.

Paths are repo-relative. `[P]` = parallelizable (different file, no incomplete dependency). Story labels map to spec user stories.

## Phase 1: Setup

- [ ] T001 [P] Add the `UPPER_LEAGUE_RASTER` source-type constant and the `ParsedUpperLeagueImport` / `League` / `Entry` types in `src/raster/ingest/groups-pdf.ts` (exported) and re-export from `webapp/src/lib/raster/pipeline.ts`.

## Phase 2: Foundational (blocking — parser)

*The parser is the bedrock of both P1 stories and the SC-002 gate. Nothing downstream works without it.*

- [ ] T002 Rewrite the parser in `src/raster/ingest/groups-pdf.ts` per [contracts/parser.md](./contracts/parser.md): anchor on league headings, read each entry's leading Rasterzahl + team + optional day/time, treat `xxx` as a vacant slot, set `size` = non-vacant entry count, and throw on unreadable structure (FR-001–FR-007).
- [ ] T003 Un-skip and complete the contract test `tests/unit/groups-pdf.test.ts` (remove `describe.skip`) so P1–P6 pass against `tests/fixtures/raster/gruppen-und-raster-2026.pdf` with `data/upper-fixed.csv` as oracle (FR-008, SC-002). Depends: T002.
- [ ] T004 [P] Expose `parseUpperLeagueRasterPdf` through `webapp/src/lib/raster/pipeline.ts`. Depends: T002.

## Phase 3: User Story 1 — A Bezirk plan respects the upper leagues (P1)

**Goal**: a scope club's upper-league team is injected into the run as a fixed, capacity-relevant, input-only team; the optimizer plans the Bezirk team clear of it; gaps are recorded.

**Independent test**: seed a `RasterSource(UPPER_LEAGUE_RASTER)` row and a scope club with a wish, assemble the run model, and verify the injected team is fixed + capacity-relevant, the Bezirk team never shares its home week/time, and the team is absent from the snapshot.

### Tests (US1)

- [ ] T005 [P] [US1] Integration test `webapp/tests/integration/upper-league-injection.test.ts` covering J1–J6 from [contracts/import-api.md](./contracts/import-api.md): matched+wish → injected; matched no-wish → `excludedNoHall`; out-of-scope club → omitted; name mismatch → `unmatched`; no import → `importPresent:false`; injected team never assigned. Reuse the collision assertion from `tests/unit/upper-league-capacity.test.ts` (PR #22) so SC-001 is exercised in the injection path, not only with a hand-built model.
- [ ] T006 [P] [US1] Test that the run's coverage record carries `upperLeague { importPresent, matched, unmatched, excludedNoHall }` in `webapp/tests/unit/raster/coverage-upper-league.test.ts` (FR-024, FR-026).
- [ ] T007 [P] [US1] Test that an injected input-only team does not appear as an assignment in the persisted snapshot in `webapp/worker/tests/test_main.py` (FR-025, SC-005).

### Implementation (US1)

- [ ] T008 [US1] Create `webapp/src/services/raster/upperLeague.ts`: load the scope+season `UPPER_LEAGUE_RASTER` import, exact-name-match its entries to the scope's clubs, and build `InjectedUpperLeagueTeam[]` — Rasterzahl `{kind:"fixed"}` and group (league+size) from the import, hall/day/start from the club's wish/venue — returning the injected teams plus the coverage facts (FR-020, FR-021, FR-022, FR-023, FR-011a, FR-024). Depends: T001, T004.
- [ ] T009 [US1] Merge the injected teams into the run's season model at run start in `webapp/src/services/raster/runs.ts` (so injection reflects the current import), leaving a run with no import unchanged (FR-020, FR-026, SC-006). Delivery to the worker: assemble the augmented model on the webapp side and hand it to the worker via the model the worker already reads (`db.py _raster_run_model` consumes `seasonModelJson` for a single-scope run) — decide explicitly between overwriting the run's stored model vs. passing a run-scoped augmented copy, and document the choice in the task's PR. Gate injection to single-scope Bezirk runs only (see T024). Depends: T008.
- [ ] T010 [US1] Mark injected teams input-only (`planned:false`) and exclude them from snapshot assignment/conflict rows in `webapp/worker/src/starter_worker/db.py` (FR-025, SC-005). Depends: T009.
- [ ] T011 [US1] Extend the coverage record in `webapp/src/lib/raster/coverage.ts` with the `upperLeague` block, populated from the injection facts, and keep `complete` honest about excluded/absent constraints (FR-024, FR-026). Depends: T008.

**Checkpoint**: US1 is independently testable — seed an import row and exercise a run without any import UI.

## Phase 4: User Story 2 — Import the published PDF (P1)

**Goal**: an admin uploads the Gruppen-und-Raster PDF; it is parsed, stored as a per-scope `RasterSource`, and previewed; re-import replaces and stales affected runs.

**Independent test**: upload the fixture PDF as a scheduler, confirm the parsed preview and a stored `RasterSource` row; re-upload and confirm replacement.

### Tests (US2)

- [ ] T012 [P] [US2] Route test `webapp/tests/unit/raster-upper-league-import-route.test.ts` covering I1 (store + preview), I3 (malformed → 4xx, nothing written), I4 (no scope access → 403).
- [ ] T013 [P] [US2] Test I2 in the same suite: re-import replaces the row and bumps `updatedAt` so `sourceChangedSinceStart` flags a prior run stale (FR-012).

### Implementation (US2)

- [ ] T014 [US2] Extend `webapp/src/app/api/raster/sources/upload/route.ts` (and its service) to accept `sourceType=UPPER_LEAGUE_RASTER`: parse via the pipeline, store one `RasterSource` per (scope, season) with `parsedJson`, replacing any existing one, and refuse a malformed PDF (FR-010, FR-011, FR-012, FR-007). Confirm the existing `sourceChangedSinceStart` staleness query includes this `sourceType` (it keys on `RasterSource.updatedAt > run.createdAt` for the scope+season); if it filters by type, extend it so replacing this import flags prior runs stale (FR-012). Depends: T004.
- [ ] T015 [US2] Import view: upload control + parsed preview (leagues and Rasterzahlen) on the raster import page under the configured base path, with toast feedback and a responsive layout verified on a narrow viewport (FR-013; constitution VIII, X). Depends: T014.
- [ ] T016 [P] [US2] Add i18n keys for the import UI to all five locales `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.
- [ ] T017 [P] [US2] E2E `webapp/tests/e2e/upper-league-import.spec.ts`: upload the fixture and assert the preview lists the leagues.

**Checkpoint**: US1 + US2 together are the MVP — real import feeding a constrained run.

## Phase 5: User Story 3 — Know which upper-league teams were matched (P2)

**Goal**: the admin sees which of this scope's clubs matched the import and which published entries were left aside, before a run.

**Independent test**: import for a Bezirk with known upper-league teams and confirm matched teams listed and unmatched entries counted.

### Tests (US3)

- [ ] T018 [P] [US3] Test that the preview reports matched teams, unmatched entries, and excluded-no-hall teams for the scope in `webapp/tests/integration/upper-league-review.test.ts` (US3 scenarios 1–3, SC-003).

### Implementation (US3)

- [ ] T019 [US3] Surface matched / unmatched / excluded upper-league teams in the import preview and pre-run view, sourced from the injection facts (FR-013, SC-003). Depends: T008, T015.
- [ ] T020 [P] [US3] Add i18n keys for the matched/unmatched/excluded labels to all five locales `webapp/src/i18n/messages/{en,de,es,fr,pt}.json`.

## Phase 6: Polish & Cross-Cutting

- [ ] T021 [P] Verify SC-006 (a club with no upper-league team plans identically to before) and SC-007 (a malformed PDF never constrains a run) end-to-end, per [quickstart.md](./quickstart.md).
- [ ] T022 [P] Run `webapp` validate (typecheck, lint, `pnpm test`) and the worker pytest; fix any regressions.
- [ ] T023 [P] Note the feature in `webapp` raster docs / `CONTINUE.md`.
- [ ] T024 Regression: a combined run MUST keep *deciding* upper-league Rasterzahlen, not take them as fixed (FR-027). Gate the injection (T009) to single-scope Bezirk runs, and add a test in `webapp/tests/integration/raster-combined-run.test.ts` (or the worker) that a combined run injects no fixed upper-league teams — guarding the combined-planning path repaired in #21. Depends: T009.

## Dependencies & order

- Setup (T001) → Foundational parser (T002 → T003, T004).
- US1 (T005–T011) depends on the parser being exposed (T004) and the types (T001); testable with a seeded import row, independent of US2's UI.
- US2 (T012–T017) depends on T004; delivers the real import path that feeds US1.
- US3 (T018–T020) depends on the injection facts (T008) and the import view (T015).
- Polish (T021–T024) last; T024 (FR-027 combined-run regression) depends on the injection gate in T009.

Story completion order for a working product: **Foundational → US2 (import) → US1 (constraint)** in practice (US1 needs data), though US1 is *tested* independently by seeding a row. US3 is the P2 increment.

## Parallel examples

- After T002: T003 and T004 can proceed together.
- Within US1: T005, T006, T007 (tests, different files) in parallel; then T008 → T009/T011 (T009 and T011 both depend on T008 but touch different files, so parallel) → T010.
- Within US2: T012, T013 in parallel; T016, T017 in parallel with T014/T015 once the route exists.

## MVP

Foundational + US1 + US2 (all P1): a real imported PDF constrains a Bezirk run, with the upper-league team occupying its club's hall and excluded from the output. US3 (P2) adds match visibility.
