# Continue

## Manual baseline reconciliation: delivery/baseline-reconciled

- R1–R4 follow-up: complete normalized league/group/team identity; conservative legacy-key reuse; same-source-group map/refresh policy; normalized alias deduplication; stale reviewed IDs reopen before automatic matching. Post-integration focused checks: 61 webapp tests, non-incremental typecheck and changed-file lint passed. Full local suite is blocked by read-only donor dependency reconciliation; fresh review and CI remain required. PR67 main prerequisite merged locally, retaining both continuity notes.

- Kept the upstream RasterManualBaseline schema/services; did not import the stale ManualBaseline implementation or migration.
- Fixed rulebook range validation, verified source/model group identity, snapshot team identity and unresolved-output retention, durable ignore/accept decisions, and moved-target review invalidation.
- Added regression and authorization/no-baseline parity assertions. Configured full webapp Vitest: 134 files / 494 tests passed; root focused tests, both typechecks, both full ESLint checks, architecture, duplication, and text checks passed.
- Evidence: repository-root reports/delivery/baseline/evidence.md and adjacent logs. Browser/database-backed E2E and deployment remain unverified; no live click-TT or credentials used.

## 2026-10-04 PR67 CI remediation follow-up

- Preserved the standalone Playwright browser-registry fix from `3756ec8`.
- `scripts/run-next.mjs` now passes the checkout raster root before Next's standalone server changes cwd; an explicit `RASTER_REPO_ROOT` remains authoritative.
- New integration regressions execute the real launcher and raster subprocesses for roster bytes, assignment scoring/rulebook JSON, upper-league PDF parsing, and root overrides. Removing the launcher fix reproduces three subprocess failures; the explicit override still passes.
- Focused roster/scoring/override checks and the real 31-league PDF check have passed. Full remote CI remains required after independent review; no push or merge is authorized for this worker.
- Resource floor triggered a test pause; evidence and current validation limits are in root `reports/delivery/ci-remediation/FOLLOWUP-REPORT.md`.

<!-- continuity:fingerprint=effa3ad62f61f522b6780b4fb9aafd40faefb35fa6bb1a2132546033797aecb1 -->

## Current Snapshot

- Updated: 2026-08-10 19:14:36
- Branch: `codex/fix-high-python-dependencies`

## Recent Non-Continuity Commits

- e80b057 fix: patch high-severity dependencies (#47)
- b85afb9 Configure Dependabot updates
- 595055a Merge pull request #27 from TKlerx/011-raster-import-ux
- e104ec3 Fix raster import e2e workspace fixtures
- 32954e6 Cover scheduler raster source adoption

## Git Status

- M next-env.d.ts
- M worker/pyproject.toml
- M worker/uv.lock

## Active Specs

- No active spec folders detected.

## Next Recommended Actions

1. No unchecked tasks detected in the active specs.

## 2026-09-04 fast-uri security patch

- Patched fast-uri overrides and lockfile resolutions to 3.1.6 for GHSA-jqff-g426-hqxp, including the parent CLI workspace override. Frozen-lockfile verification and targeted URI/AJV regression checks pass. Changes are prepared in an isolated security worktree; not committed or pushed.
