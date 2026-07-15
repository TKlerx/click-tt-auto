# Phase 0 Research: Guided Raster Navigation

**Feature**: `005-raster-guided-navigation` | **Date**: 2026-07-14

The specification carries no unresolved clarifications. The unknowns here are technical: how to express the four steps, how to key an input set to a scope without foreclosing feature 006, how to detect that a record's source data actually changed, and how to classify a scope as Bezirk or Verband. Each is resolved below.

---

## R-001: How are the four steps expressed?

**Decision**: Route segments under `(dashboard)/raster/` — `import`, `review`, `run`, `runs` — with scope and season remaining query parameters. `raster/page.tsx` becomes a redirect to the default step.

**Rationale**: FR-004 requires the selected step to be addressable so a reload or a shared link restores it. Route segments give this for free through the App Router, keep each step a separate server component that loads only its own data, and let `layout.tsx` host the persistent selection (FR-003) without re-rendering it per step. Scope and season stay query parameters because they already are (`?district=&season=` in today's page), because they are orthogonal to the step, and because `layout.tsx` can read them via `searchParams` to render the nav.

**Alternatives considered**:

- _Client state / tabs_: fails FR-004 outright — no address, no reload restoration, no sharing.
- _Query param `?step=`_: satisfies addressability but keeps one giant page component and forfeits per-step data loading, which is most of the performance benefit.
- _Scope and season as path segments_ (`/raster/[scope]/[season]/[step]`): cleaner-looking, but churns every existing link and bookmark for no requirement. Deferred; nothing forecloses it.

---

## R-002: Two left navigations — how do they coexist?

**Decision**: The step navigation is a secondary nav rendered _inside_ the Raster content area by `raster/layout.tsx`, not an extension of the global sidebar.

**Rationale**: `DashboardLayout` already renders a fixed `DashboardSidebar` at `md:pl-64` (`webapp/src/app/(dashboard)/layout.tsx`). The spec asks for a "guided left-navigation flow" for Raster specifically. Putting steps into the global sidebar would mix application-level navigation (Raster, Users, Settings, Audit trail) with a workflow that only exists inside one of them, and would leave the sidebar showing Raster steps while the user is on Settings. A secondary nav scoped to the Raster area keeps each nav answering one question: the global one "which part of the app", the local one "where in this workflow".

**Alternatives considered**:

- _Expand the global sidebar with Raster sub-items_: one nav instead of two, but couples global navigation to Raster's workflow state and complicates readiness badges outside the Raster context.
- _Horizontal step bar / breadcrumb_: sidesteps the double-nav question, but the spec says left navigation, and a horizontal bar has no room for per-step readiness text (FR-011, FR-012).

**Note for planning**: two left-hand navs is a genuine layout constraint at narrow widths. Spec Assumptions already declare the narrow-screen presentation a design detail rather than a scope question; this research does not settle it beyond confirming the nesting.

---

## R-003: How is an input set keyed to a scope without foreclosing feature 006?

**Decision**: Replace `RasterInputSet.district: String` with a nullable-free `scopeId` foreign key to `Scope`, and do the same for `RasterHallCapacity.district`. Model the _spanning_ case (feature 006) as a future additive join table, not as a change to this key.

**Rationale**: `RasterSource` already carries `scopeId` with a real relation, so this makes the input set consistent with the source model rather than inventing a pattern. The current string is resolved by matching `Scope` on `code` **or** `name` at any hierarchy level (`webapp/src/lib/raster/access.ts`), which is what let "district" silently hold `WTTV`; a foreign key ends that class of bug.

FR-026 requires not foreclosing a spanning input set. A single `scopeId` FK does not foreclose it: feature 006 can add a `RasterInputSetScope` join table and treat `scopeId` as the primary/owning scope, or introduce a distinct combined entity. What _would_ foreclose it is encoding "one scope" into unique constraints that a spanning set must violate — so the unique constraint is on `(scopeId, season, name)` rather than on `(scopeId, season)`, leaving room for a later spanning row.

`RasterHallCapacity.district` is included because it is the same scope-shaped string with the same defect, and leaving it as text while the input set moves to an FK would guarantee they drift. Its unique constraint becomes `(scopeId, clubId, hall, weekday)`.

**`RasterSnapshot.district` is included for exactly the same reason** (added 2026-07-15, found while planning feature 006). The schema carries the string in **three** places — `RasterInputSet`, `RasterHallCapacity`, and `RasterSnapshot` — and this research originally caught only the first two. The argument above applies verbatim to the third: rekeying two of three guarantees drift between them, and leaves the schema still carrying a scope-shaped string after a feature whose whole point was removing them. The cleanup task (T047) would not have caught it either, since it inspects `webapp/src/` rather than the schema. Its index becomes `@@index([scopeId, createdAt])`.

Feature 006 needs a snapshot to span several scopes, but that is additive there and does not change this decision: one owning `scopeId` here, a spanned set later — the same shape as the input set.

**Alternatives considered**:

- _Keep the string, validate on write_: cheaper, but preserves the code-or-name ambiguity and the ability to store a value matching no scope.
- _Rekey the input set only, leave capacities as strings_: smaller diff, but capacities are looked up per district on every capacity review; two keying schemes for the same concept is how the current inconsistency arose in the first place.
- _Introduce the spanning join table now_: speculative — feature 006's shape depends on an unanswered solver-feasibility question. FR-026 asks that it stay buildable, not that it be built.

---

## R-004: How is "the record's source data actually changed" detected?

**Decision**: Store a content fingerprint per reviewed record — a stable hash over the parsed fields that the review actually concerns — and compare it after each parse. A record is outstanding when no fingerprint exists, or the current fingerprint differs from the reviewed one.

**Rationale**: FR-010 requires that only records whose parsed data actually changed become outstanding, and FR-010a requires that a re-parse yielding identical data changes nothing. Tracking _that a source was touched_ cannot satisfy either — refreshing a source re-parses every record it contains, so touch-tracking degrades to whole-source invalidation, which is option B that the clarify session rejected.

The fingerprint covers the fields the matching review is about: the club/team identity the record matched to, and the wish fields carried (`homeWeekday`, `hall`, `startTime`, `spielwochePref`). It must be computed from normalised values, not raw text, so that insignificant re-parse differences (whitespace, ordering) do not present as changes and re-open reviews spuriously — which would fail FR-010a in practice while passing it in theory.

**Alternatives considered**:

- _Timestamp comparison (`source.updatedAt` vs `reviewedAt`)_: trivial, but any refresh invalidates every record from that source regardless of content. Fails FR-010a.
- _Store the full reviewed payload and deep-compare_: exact, no hash collisions, but stores a copy of the parsed data per record and makes the comparison the app's problem on every render.
- _Diff at parse time and mark affected rows_: viable, but couples every parser to review state, and a record can also become stale by a re-match rather than a re-parse.

**Risk**: fingerprint scope is the crux. Too narrow and a real change slips through, leaving a stale confirmed match; too broad and unrelated churn re-opens reviews, recreating the repetition this feature removes. FR-010a is the test that keeps it honest, and it belongs in unit tests over the fingerprint function directly.

---

## R-005: How is a scope classified as Bezirk or Verband for labels?

**Decision**: Derive the level from position in the hierarchy — a scope whose parent is the root (`DE`) is the Verband; a scope whose grandparent is the root is a Bezirk. Expose it as a small helper (`lib/raster/scope-level.ts`) and label via next-intl keys carrying the proper names "Bezirk" and "Verband" in every locale.

**Rationale**: FR-022a requires the UI to name levels Bezirk and Verband and never "District". The hierarchy is seeded `DE` → `WTTV` → 13 Bezirke (`webapp/prisma/seed.ts`), and `Scope` already models `parent`/`children`, so the level is derivable without adding a column. Deriving beats storing because a stored level can disagree with the tree it describes.

The names go through next-intl because every other user-facing string does and the app ships five locales — but they are proper names carried unchanged across locales, exactly as the scope names themselves already are (`Westdeutscher Tischtennis-Verband` is not translated today). This is consistent with the spec's Out of Scope note that FR-022a is not a translation decision.

**Alternatives considered**:

- _Store a `level` enum on `Scope`_: explicit and queryable, but adds a column that can contradict `parentId`, and scope creation is seed-only so nothing would maintain it.
- _Hardcode by code (`code === "WTTV"`)_: works today, breaks the moment a second Verband exists, and encodes org structure in a conditional.
- _Depth integer_: same as the parent walk but less readable at the call site.

---

## R-006: How is existing Raster data discarded safely?

**Decision**: Drop and recreate Raster tables as part of the schema change, but have the migration **verify** emptiness of the human-authored data rather than assume it, and fail loudly if it finds any.

**Implementation check 2026-07-15**: No application database URL was configured in the shell. The local e2e PostgreSQL database (`click-tt-e2e-postgres`) initially contained 1 `RasterHallCapacity` row with `basis = REVIEWED` and 1 `RasterReviewDecision` row (`club-e2e`). The e2e database was reset with user approval; the check now returns 0 reviewed capacities and 0 review decisions, so T001 passes for the reachable local environment.

**Rationale**: FR-024 authorises discarding rather than migrating, resting entirely on the spec assumption that no production Raster data exists. That assumption is load-bearing and stated as such. Constitution Principle II says that where the situation is uncertain, skip and report rather than guess — so the implementation should confirm what it is about to destroy instead of trusting a spec assumption written weeks earlier.

The check is narrow: `RasterHallCapacity` rows with `basis = REVIEWED` and any `RasterReviewDecision` rows are the only Raster data that no reimport can restore (sources, wishes, groups, input sets, runs and snapshots are all reimportable). If either is non-empty, the migration should stop and report rather than proceed, at which point FR-024 needs revisiting exactly as the spec's assumption says.

**Alternatives considered**:

- _Assume empty, drop unconditionally_: what FR-024 literally permits. Fast, and wrong the one time the assumption has gone stale.
- _Write a real migration anyway_: contradicts a settled clarification and reintroduces the code-or-name ambiguity this feature exists partly to end.

---

## R-007: How is per-step readiness derived?

**Decision**: A single `lib/raster/readiness.ts` computing all four steps' states from existing data plus the new match-review table, consumed by both the nav (FR-011) and the default-step redirect (FR-004a).

**Rationale**: FR-004b requires the default step to derive from current readiness rather than remembered preference, and FR-011 requires the nav to show readiness. These are the same computation with two consumers, so one module keeps them from disagreeing — a nav saying "ready" while the redirect lands elsewhere would be worse than either alone.

The inputs already exist: sources present (`services/raster/sources`), group planning status and wish completeness (season model JSON), capacity review (`reviewHallCapacitiesForInputSet`, whose `blockingCount = missingCount + insufficientCount`), input set status (`READY` gates runs today), and finished runs. Only match-review state is new.

FR-011a requires distinguishing "ready with every group included" from "ready because groups are excluded", so readiness is not a single enum — it carries whether any group is excluded alongside the state. This is the requirement most easily lost in implementation, because the naive shape is a four-value enum per step.

**Alternatives considered**:

- _Compute readiness per step page_: each step already loads its own data, but the nav needs all four states at once, so this duplicates the logic in the layout anyway.
- _Persist readiness_: it is derived from data that changes underneath it; a stored copy is a cache invalidation problem in exchange for nothing.

---

## R-008: Should a snapshot from a partial run be marked as partial? (spec Q4)

**Decision**: Not in this feature. The flow's own presentation carries the burden (FR-006g, FR-011a, SC-013); the snapshot record is left alone. Raise it as a follow-up against feature 006 or its own change.

**Rationale**: The spec deferred this to planning, so planning must either settle it or say plainly that it does not belong here — leaving it "for planning" a second time is how a question quietly becomes nobody's.

It does not belong here, for two reasons. First, the spec's Out of Scope forbids changing snapshot contents, and marking a snapshot is exactly that; resolving Q4 affirmatively would need a spec amendment rather than a planning decision. Second, the risk it addresses is real but out of reach: a snapshot outlives the flow and surfaces in run comparison, where nothing would say it covered only nine of twelve groups. That is a genuine hazard — and it is the same hazard feature 006 must solve for combined snapshots (its FR-020, FR-021 require a combined snapshot to be identifiable as such). Solving it once, coherently, across both partial and combined runs beats bolting a flag onto this feature.

**What this feature does instead**: within the guided flow, a Bezirk with excluded groups can never read as fully planned (FR-006e), no step shows unqualified ready (FR-011a), and a run with exclusions is presented as provisional (FR-006g). The gap is strictly outside the flow — in the snapshot list and in run comparison.

**Residual risk, stated plainly**: a scheduler opening a partial run's snapshot from run comparison has nothing telling them it is partial. Acceptable for now because runs are the scope's own work and the person who excluded the groups is the person reading the result, days apart at most. It stops being acceptable once snapshots are shared or long-lived, or once combined runs exist alongside single-scope ones.

**Update 2026-07-15 — the residual risk is closed by feature 006.** This section predicted the marking would be feature 006's to specify. It now is: `specs/006-combined-wttv-planning/` FR-030 to FR-038 define a coverage record — what a run spanned and what it lacked, written at run start and never revised — and **FR-035 applies it to single-scope runs explicitly**, so a Bezirk run with excluded groups is marked incomplete by the same rule. That is precisely this question.

Nothing about this feature changes as a result: 005 still does not build the marking, and its task list is unaffected. The decision to decline stands; what changes is that the residual risk has an owner and a specification rather than being merely acknowledged. It is closed when 006 lands, not before.

**Alternatives considered**:

- _Mark the snapshot now_: directly contradicts the spec's Out of Scope, and would design the marking without knowing what feature 006 needs it to express.
- _Leave it silently deferred_: what the plan originally did. The question then belongs to no artifact and resurfaces as a bug report.

---

## Resolved unknowns summary

| ID    | Unknown                             | Decision                                                                                      |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| R-001 | Step expression                     | Route segments; scope/season stay query params                                                |
| R-002 | Two left navs                       | Nested secondary nav inside the Raster area                                                   |
| R-003 | Scope keying                        | `scopeId` FK on input set and hall capacity; spanning stays additive                          |
| R-004 | Change detection                    | Per-record fingerprint over normalised reviewed fields                                        |
| R-005 | Bezirk/Verband                      | Derived from hierarchy position; proper names via next-intl                                   |
| R-006 | Discarding data                     | Drop and recreate, but verify irreplaceable data is absent first                              |
| R-007 | Readiness                           | One shared module; carries exclusion alongside state                                          |
| R-008 | Marking partial snapshots (spec Q4) | Not here. Feature 006 now specifies it (its FR-030–FR-038, FR-035 covering single-scope runs) |

**No NEEDS CLARIFICATION remain.** Spec Q4 is answered by R-008 — declined with reasons, not deferred again.
