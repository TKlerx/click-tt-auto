# CLI Contract: `raster` subcommand

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Invoked via `pnpm raster <command> [flags]`. Three pipeline stages, runnable separately so the organizer can review the model between them.

## Commands

### `raster ingest`
Build the reviewable `SeasonModel` from inputs.

- `--wishes <path...>` — Terminmeldung PDF(s) (repeatable)
- `--groups <path>` — group assignment + fixed Rasterzahlen PDF (`Gruppen-und-Raster-*.pdf`)
- `--from-clicktt` — scrape wishes + groups from click-TT instead of PDFs (US4/P3; reuses `.env`)
- `--out <path>` — write the model (default `reports/raster/model.json`)
- Emits: model JSON + stdout summary listing every `review`-flagged field and `warnings`. Non-zero exit if any hard input is unparseable.

### `raster score`
Score a given assignment against a reviewed model.

- `--model <path>` — reviewed `SeasonModel` (default `reports/raster/model.json`)
- `--assignment <path>` — `Assignment` JSON to evaluate
- `--weights <path>` — `Weights` JSON (defaults documented below)
- `--report <path>` — JSON `EvaluationResult` out (default `reports/raster/score-<date>.json`)
- Emits: stdout summary (teams, wishes fulfilled/unfulfilled/unfulfillable/unknown with reasons, hall over-usages with hall+slot, hard violations) + JSON report. Does not modify inputs.

### `raster optimize`
Search for a minimal-penalty assignment.

- `--model <path>` — reviewed `SeasonModel`
- `--weights <path>` — penalty weights
- `--start <path>` — optional starting assignment; result is guaranteed ≤ its penalty
- `--pin <teamId=rasterzahl>...` — additional hard pins (repeatable)
- `--out <path>` — proposed `Assignment` out (default `reports/raster/assignment-<date>.json`)
- `--report <path>` — `EvaluationResult` for the proposal (before/after objective)
- Emits: proposed assignment + evaluation. Honors fixed/pinned Rasterzahlen, per-group permutation validity, and derby ≤ ST4. No time limit (SC-007).

## Config / defaults

- Default weights (tunable): `{ overUsage: 10, overUsageFairness: 1, wechsel: 5, zeitgleich: 5, sameClubDerbySt4: 1000, spielwoche: 0 }` — Spielwoche A/B mismatches are reported by default, but only explicit relational wishes, ST4 same-club derby fallback, and hall over-usage drive optimization. `overUsageFairness` penalizes putting the remaining excess repeatedly on the same club; `sameClubDerbySt4` makes Spieltag 4 legal but expensive, while Spieltag 5+ remains a hard violation.
- Hall capacity default: unlimited when no capacity row is supplied. Add `club,hall,weekday,capacity` rows only for constrained halls.
- Rulebook is built-in; no flag.

## Exit codes

- `0` success · `1` unparseable required input / infeasible hard constraints (with explanation) · `2` bad arguments.
