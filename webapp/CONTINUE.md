# Continue

## 2026-10-05 urllib3 security follow-up

- Removed the obsolete August 11 urllib3 resolver cutoff while retaining the global one-week cooldown; upgraded only urllib3 from 2.7.0 to 2.8.0 for GHSA-8988-9cw3-xx77, GHSA-vxq7-64xx-v4gw and GHSA-gh4c-6fx4-qh6g.
- Frozen sync and lock validation pass. Production Python audit is clean; the development audit retains an unrelated click 8.3.2 advisory. Full PostgreSQL worker tests require the CI test database.
- All 15 database-independent worker checks pass. Full local pytest stops on an unavailable PostgreSQL connection at localhost:45432, not on an urllib3 error; CI continues to run the complete suite.

## 2026-10-05 security PR CI repair

- Reconciled security PR #66 with current main, reusing its tested standalone raster-root, browser-registry and configurable build startup fixes instead of duplicating them.
- Security dependency changes remain; no checks are disabled. Verify fresh full CI on the reconciled branch.
- Production build, typechecks, 142 CLI tests and 14 configuration/registry tests pass locally. The four real raster subprocess regressions also pass after making their HTTP/tsx fixture portable to Windows.

## 2026-10-04 PR67 CI remediation follow-up

- Preserved the standalone Playwright browser-registry fix from `3756ec8`.
- `scripts/run-next.mjs` now passes the checkout raster root before Next's standalone server changes cwd; an explicit `RASTER_REPO_ROOT` remains authoritative.
- New integration regressions execute the real launcher and raster subprocesses for roster bytes, assignment scoring/rulebook JSON, upper-league PDF parsing, and root overrides. Removing the launcher fix reproduces three subprocess failures; the explicit override still passes.
- Focused roster/scoring/override checks and the real 31-league PDF check have passed. Full remote CI remains required after independent review; no push or merge is authorized for this worker.
- Resource floor triggered a test pause; evidence and current validation limits are in root `reports/delivery/ci-remediation/FOLLOWUP-REPORT.md`.

<!-- continuity:fingerprint=effa3ad62f61f522b6780b4fb9aafd40faefb35fa6bb1a2132546033797aecb1 -->

## Current Snapshot

- Updated: 2026-10-04 22:57:44
- Branch: `codex/security-20261004`

## Recent Non-Continuity Commits

- e4fa2bc Implement manual Rasterzahl baselines
- ebba8c5 Upgrade Spec Kit and add convergence workflow
- 6d40dbf Document webapp follow-up work
- e7bdafd Plan manual baseline Rasterzahlen import
- 6d48178 Fix fine dedup and reconcile open tasks

## Git Status

- M package.json
- M pnpm-lock.yaml
- M pnpm-workspace.yaml

## Active Specs

- No active spec folders detected.

## Next Recommended Actions

1. No unchecked tasks detected in the active specs.

## 2026-10-04 security dependencies

- Updated affected CLI and webapp dependencies; removed obsolete overrides where native ranges suffice.
- Webapp frozen lockfile passes. CLI audit is clean; webapp audit retains only the unpatched braces 3.0.3 advisory. Full application validation awaits PR CI.
- Initial PR CI passed CLI checks but failed E2E because standalone tracing omitted Playwright runtime assets. Added a narrow playwright-core tracing include; existing E2E checks provide the regression check on the next CI run.
