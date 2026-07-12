# Research: Raster Run Comparison

## Decision: Model comparison around scenarios, not separate run/import tables

**Decision**: Expose optimizer results and manual assignments through one `Scenario` read model with origin, strategy,
status, settings, KPI summary, details link, and staleness.

**Rationale**: The admin compares results, not storage internals. One read model keeps the UI and KPI logic small.

**Alternatives considered**:
- Separate compare paths for runs vs manual plans - rejected because it duplicates KPI and table rendering.
- A generic snapshot import feature - too broad for 004; manual schedule-number assignment is the actual need.

## Decision: Reuse existing scoring for manual assignments

**Decision**: Convert valid manual schedule-number choices into the same assignment shape used by optimizer output, then
run the existing score/conflict derivation.

**Rationale**: Shared KPIs only stay honest if they are computed by the same code.

**Alternatives considered**:
- Manual-only scoring code - rejected because it would drift.
- Storing manual KPIs typed by users - rejected because it cannot be trusted.

## Decision: Honest phase/status instead of progress percentages

**Decision**: Track queued, running, completed, feasible, failed, cancelled, and no-solution states. Do not show a
percentage unless a future solver exposes real progress.

**Rationale**: CP-SAT can run for minutes without linear progress. Fake precision is worse than a clear status.

**Alternatives considered**:
- Progress bar with guessed percentages - rejected as misleading.
- Blocking request/response runs - rejected because existing runs are background jobs.

## Decision: Visual manual entry plus simple paste/upload import

**Decision**: Manual v1 supports a group/team/schedule-number form and a simple table import that pre-fills that form.
Unmatched rows are corrected in the same visual flow.

**Rationale**: This covers the colleague workflow without building a spreadsheet clone.

**Alternatives considered**:
- Arbitrary PDF/OCR manual import - rejected for v1 as high effort and low reliability.
- Upload only - rejected because the user explicitly needs visual entry.

## Decision: Keep Claude branch changes out of 004

**Decision**: Do not copy the `speckit-clarify-041a87` branch into 004. Its changes clarify 003 topics, not scenario
comparison.

**Rationale**: Importing it would pollute 004 with club identity, click-TT ingestion, retention, and i18n work.

**Alternatives considered**:
- Merge Claude branch as-is - rejected because it edits `specs/003-raster-review-webapp` and creates no 004 artifacts.
