# Manual baseline reconciliation evidence

## Scope and decision

- Branch: `delivery/baseline-reconciled`; starting upstream: `e4fa2bcc48ceea6820639efee7286c727d717c14`.
- Reviewed candidate commit `6dc012773e780136f9ede4053790958e8595e677` through Git objects. The requested `wt/t_57f284ce` name is absent from the local worktree listing; the exact candidate object exists at a detached worktree and was available without modifying it.
- Upstream already independently implements specs/012 using `RasterManualBaseline`, `RasterManualBaselineRow`, and a nullable run `baselineId`. Candidate uses a different `ManualBaseline` schema, service, settings-based baseline identity, and migration. No cherry-pick, migration, solver payload, generated-client commit, or replacement implementation was applied.
- Only confirmed behavioral corrections were implemented in the upstream `manualBaselines.ts` service. Existing route authorization and run attachment remained unchanged; tests document their parity.
- All repository modifications and generated artifacts are confined to this worktree. Root integration snapshot and other branches/worktrees were not modified. No pushes, merges, deployments, live Click-TT access, credential use, gateway actions, or Kanban launches.

## Requirement-by-requirement matrix

| Requirement | Upstream evidence and disposition | Executed evidence / limitation |
|---|---|---|
| FR-001 scheduler import/refresh | Existing baseline POST and versioned import service retained. | Upstream focused service/API tests passed first; activation/concurrent-import tests pass in final suite. |
| FR-002 authenticated live navigation, no saved-URL replay | Existing `live-baseline-scraper.ts` invokes login and `scrapeTeamRasterAssignments`; group selection clicks live links by occurrence. Retained. | Root manual-baseline scraper fixture test passes. No live login performed. |
| FR-003 hidden/group navigation | Existing scraper parses group assignment tables after authenticated navigation; retained. | Captured/mock-page test only. Real hidden-page availability cannot be established without prohibited live access. |
| FR-004 source provenance | Prepared rows retain original verified group title, team, Rasterzahl, URL, importedAt; baseline source summary retains workspace scope/season. Retained. | Service preparation and activation tests pass. |
| FR-005 correct source/model group identity | CONFIRMED GAP: scraper writes verified page title to `league`, navigation label to `group`, and season-model builder stores these as ref.league/ref.name; upstream matched title only to ref.name and rejected valid rows. Corrected unique context resolution and group team membership. | `baseline-source-red.log`: expected rejectedCount 0, actual 1. Green counterpart passes. Ambiguous group candidates are not silently picked. |
| FR-006 optional, no hard constraints | Run baseline is a relation, not settings or solver assignments. Retained. | Run tests assert unchanged settings with/without baseline; full suite passes. |
| FR-007 separate from wishes/capacity/fixed/output | Existing dedicated models, services, and nullable run relation retained. | Schema/service inspection; no schema or solver changes in reconciliation diff. |
| FR-008 one review area; invalid rows | Existing review UI/status handling retained. CONFIRMED GAPS: hand-written group-size range accepted unsupported sizes 0/4/4.5; row mapping could mark an out-of-range Rasterzahl MATCHED. Use numeric shared rulebook (including odd sizes and double mode); validate map target's unique group/range. | `baseline-range-red.log` shows three invalid group sizes incorrectly MATCHED; numeric boundaries tested for sizes 5..12 in both modes. `baseline-map-red.log` shows invalid mapping resolved instead of rejecting; green checks pass. |
| FR-009 durable decisions across refresh | Existing stable normalized group/team key excludes Rasterzahl and stateful URL. CONFIRMED GAPS: ignoring/accepting invalid rows was lost on refresh; ignored/accepted rows regained automatic targets; mapped targets that left their source group remained matched. Corrected these without changing schema. | `baseline-review-red.log`: four failures; `baseline-moved-team-red.log`: moved target incorrectly MATCHED. Green counterparts pass; compatible mapping persists across Rasterzahl changes. Duplicate source identities still require review. |
| FR-010 ready only once settled | Existing READY derivation requires MATCHED/IGNORED/ACCEPTED_UNRESOLVED. Retained, with invalid map rejection and durable decisions above. | Decision/readiness/count tests pass. |
| FR-011 optional run selection | Existing UI and run request baselineId selection retained. | Run tests cover ready selection, omitted baseline, and unavailable workspace baseline rejection before run/job creation. |
| FR-012 exact baseline version for run/snapshot | Existing immutable run baseline FK and historical version retention are superior to candidate settings metadata. Snapshot comparison reads `snapshot.run.baseline`, not the currently active workspace version. Retained. | Snapshot test returns baselineId `original-version`; API/service query includes originating run's baseline rows. This does not claim that the workspace season model itself is immutable. |
| FR-013 unchanged/changed/new/missing deltas | CONFIRMED GAP: snapshot team resolution used group OR league, making same-name teams ambiguous or falsely matched. Default name-only fallback Map collapsed unresolved outputs, including same-name outputs in distinct groups and repeated unresolved rows. Require both league and group; unique synthetic fallback retains each unresolved output. | `baseline-identity-red.log`: expected changed 1/new 4/missing 0, actual changed 0/new 2/missing 1. Green snapshot fixture yields six distinct comparison rows. Existing all-four-state projection test passes. |
| FR-014 deltas not hard violations | Comparison remains a read projection outside fixed-assignment/scoring logic. Retained. | Run solver settings unchanged; root/webapp typecheck and full web suite pass. |
| FR-015 failure preserves previous active | Existing inactive attempt, transactional activation, and failure-only update retained. Errors are sanitized and name navigation step. | Existing failed-crawl test asserts no deactivation updateMany and no secret page dump. Passed before/after. Real DB rollback, partial-index contention, and live failures not exercised. |
| FR-016 viewer cannot write/no write GET | GET requires viewer and calls read service only; POST/PATCH require scheduler. Retained. | API assertions cover no import/review/audit on GET, denied POST before crawling/audit, and denied PATCH. Existing read-only UI e2e spec inspected, not executed. |
| FR-017 workspace isolation | Existing row query requires active baseline+inputSetId; run baseline query requires READY+inputSetId; retained. | Cross-workspace row and baseline rejection tests assert scoped queries and no row mutation/run/job creation. |
| SC-006 no-baseline parity | No baseline lookup on run start without selection; settings preserved; snapshot comparison returns null without baseline, even with unusable model JSON. | Explicit parity assertions pass. No baseline defaults or constraints introduced. |

## Verification

Baseline tested before editing production code:

- Root focused tests: 2 files / 5 tests passed (`baseline-root-before-focused.log`).
- Upstream webapp focused tests: 3 files / 18 tests passed (`baseline-web-before.log`).
- Every production correction above has a recorded failing regression before implementation and passing tests after it. The baseline/map/group/model comparison functions are real; database and authorization boundaries use the repository's existing mocks.

Final checks:

| Check | Result | Log |
|---|---|---|
| Webapp focused baseline/run/API tests | 3 files / 43 tests passed | `baseline-final-focused.log` |
| Full webapp Vitest, configured | 134 files / 494 tests passed | `baseline-web-full-tests-configured.log` |
| Root scraper/rulebook focused | 2 files / 5 tests passed | `baseline-final-root.log` |
| Root typecheck | exit 0 | `baseline-root-typecheck.log` |
| Root full ESLint | exit 0 | `baseline-root-lint.log` |
| Webapp typecheck | exit 0 | `baseline-web-final-typecheck.log` |
| Webapp full ESLint | exit 0 | `baseline-web-full-lint.log` |
| Architecture | exit 0; pre-existing auth/better-auth cycle warning | `baseline-architecture.log` |
| Duplication | exit 0; 3.28% duplicated lines | `baseline-duplication.log` |
| Text conventions | exit 0 | `baseline-text.log` |
| Actual webapp precommit gate | exit 0 | `baseline-precommit.log` |
| Git diff whitespace | exit 0 | final terminal check |

Full suite initially failed due to absent DATABASE_URL/APP_DATABASE_URL (13 import-time failures) and two source-cache subprocess tests exceeding their default 30-second timeout under concurrent load. Retried failed suites successfully, then reran the entire suite with synthetic non-production URL `postgresql://test@127.0.0.1:1/test` and `--maxWorkers=2 --testTimeout=120000`: all 494 tests passed. No database credentials were read and no production endpoint was used. Node 26 emits a module.register deprecation warning. Focused lint initially flagged a 614-line describe callback; tests were split into separate suites and full lint then passed.

Commands (from this worktree/webapp unless stated):

```sh
APP_DATABASE_URL=postgresql://test@127.0.0.1:1/test DATABASE_URL=postgresql://test@127.0.0.1:1/test node node_modules/vitest/vitest.mjs run --maxWorkers=2 --testTimeout=120000
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs --exclude '^generated/' src
node scripts/check-duplication.mjs
node scripts/check-text-conventions.mjs
pwsh -NoProfile -File validate.ps1 precommit
# worktree root:
node node_modules/vitest/vitest.mjs run tests/unit/manual-baseline-scrape.test.ts tests/unit/rulebook.test.ts --maxWorkers=2
```

## Environment/dependency inventory and blockers

- Created worktree-local root node_modules (~254 MiB), webapp/node_modules (~862 MiB), and webapp/generated/prisma (~4.1 MiB). No shared client generation/build, no .env files, no Python environment, no browser installation, and no app build.
- Existing sibling dependencies did not match lockfiles/schema, so were not reused as a shared client or linked dependency tree. Frozen-lockfile installs reused the content-addressed pnpm store; package manifests and lockfiles remain unchanged. Offline attempts hit missing metadata; a web online attempt timed out, then a retry succeeded. Install logs are retained. Root/client Vitest resolved to 4.1.11; local Prisma generation used 7.8.0 from the existing lockfile.
- Tool-created caches: worktree-local ignored generated Prisma, node_modules, Vitest/Vite caches if present, TypeScript incremental cache, duplication reports; pnpm store/metadata cache was reused/populated by installs. Scratch logs originated under /opt/data/cache/scratch/baseline-*.log and are copied beside this matrix.
- Disk checked before install: ~17 GiB free; latest check ~15 GiB free, above the requested 10 GiB reserve. No original worktree or commits removed.
- `rtk` was already known unavailable (exit 127); commands ran directly.
- Not verified: live Click-TT context/hidden pages, five-minute import performance, real PostgreSQL transaction/concurrency behavior, database-backed Playwright UI tests, image/browser packaging or deployed runtime. These need authorized disposable DB/browser fixtures or separate delivery validation; no deployment is authorized here.
