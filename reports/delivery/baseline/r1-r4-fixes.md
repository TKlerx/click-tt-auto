# Baseline blocking review fixes (R1–R4)

Starting candidate: `ae9ca3eb00e2045c0e3b7a4bb01b1cdc2d6ae424` on `delivery/baseline-reconciled`.
Read the actual worktree independent-review.md, specs/012 spec/research, implementation and tests. Only manual baseline service and its regression tests changed; schema, migrations, auth, solver payload/parity and rulebook ranges are untouched.

## Policy and fixes

- **R1**: New persisted keys encode normalized `[league-or-null, navigation-group, team]`; counts and carry-forward use this full identity, independent of source order or source URL. Existing two-label helper stays compatible for other consumers. Legacy decisions carry only for a uniquely named model group when the supplied context is group-only (or league equals group), with no historical occurrence-suffixed key. Distinct league/navigation-group keys cannot safely reconstruct their historical context: never infer their missing group from today's remaining scrape/model, and do not copy their ignored/accepted decisions. Such rows are classified afresh; no schema migration or destructive history update.
- **R2**: Choose same-source-group mapping policy, grounded in FR-005 intended source group/team context and FR-009/research identity continuity (group/team changes invalidate identity; number changes do not). Map-time and refresh-time share source-group resolution. Targets must belong to exactly one model group, that resolved source group, and have a valid rulebook Rasterzahl. Incompatible mappings fail before the transaction/write. Actual map→persisted-decision→refresh tests cover new contextual and safe legacy keys.
- **R3**: Deduplicate aliases after NFKC/case/whitespace normalization, within each group only. Actual distinct groups with a common alias remain ambiguous.
- **R4**: Check reviewed target compatibility before automatic label matching. Removed, moved, or ambiguous-membership targets reopen review, clear target/review metadata and cannot settle on a same-name replacement. Invalid ranges and duplicates retain their existing classifications.

## Executed checks before upstream integration

All Vitest runs used existing dependencies, one worker and `--no-cache`; synthetic loopback DB URLs for webapp tests. Functions under test are actual service functions, with storage boundaries mocked. No live services/credentials/network crawling.

| Evidence | Result |
| --- | --- |
| r1-red.log → r1-green.log | 5 intended failures → 41 service tests pass |
| r2-red.log → r2-green.log | cross-group map incorrectly accepted → 44 service tests pass |
| r3-red.log → r3-green.log | 3 equivalent-alias rejections → 48 service tests pass |
| r4-red.log → r4-green.log | moved/removed same-name replacement and ambiguous target settled → 51 service tests pass |
| r1-r4-focused.log | 3 files / 59 tests pass (service, run service, API) |
| r1-r4-root.log | 2 files / 5 tests pass (actual scraper/rulebook) |
| r1-r4-lint.log | changed service/test ESLint, no cache: exit 0 |
| prettier | both changed TypeScript files formatted successfully |
| git diff --check | exit 0 |
| r1-r4-typecheck.log | initial bounded full webapp tsc --noEmit --incremental false timed out after 240s, exit 124, empty output; not a passing gate |

Node webapp runs emit an existing DEP0205 module.register deprecation warning.

## Resource/reuse inventory

No installations, new environments, build outputs, browsers, generated clients or donor/cache mutations. Verified donor lockfile, PostgreSQL schema, Prisma config and Vitest config match byte-for-byte before creating these worktree-local symlinks:

- `node_modules` → `/home/timo/dev/click-tt-automation/.worktrees/delivery-diagnostics/node_modules`
- `webapp/node_modules` → `/home/timo/dev/click-tt-automation/.worktrees/delivery-diagnostics/webapp/node_modules`
- `webapp/generated` → `/home/timo/dev/click-tt-automation/.worktrees/delivery-diagnostics/webapp/generated`

Donor is read-only reuse. Cleanup owner: baseline delivery parent; unlink only these three local links after verification/delivery, never remove their targets. Initially capacity below floor (~8.8 GB available); external cleanup later restored ~17.3 GB. No large allocation attempted in either state.

## Upstream integration and final validation

- Fix commit: `ac8de6199f420a93da1e22ba3c5bb7dfc30306ae`.
- Merged `origin/main` at `9a3875f605dafdb7b25f47b35a4d82f34bca011d` (PR67 prerequisite) using a normal merge, no reset/rebase. Merge commit: `e6291b44a3581d66f7ceca81cfdf357a59e3a19f`. Resolved only continuity-file conflicts by retaining both baseline and PR67 sections. Upstream standalone implementation/tests are intact. Rechecked donor schema/config/lock identity after integration.
- Non-incremental webapp typecheck exposed Promise-vs-PrismaPromise mock typing in the new map→refresh tests; corrected test mock return annotations, preserving the actual mocked persistence behavior. Initial post-merge failure is retained in `r1-r4-typecheck-postmerge.log`; subsequent passing check in `r1-r4-typecheck-green.log`.
- Added a further actual-service RED for removed/moved reviewed targets held under historical league-only keys (`r4-legacy-red.log`, 2 intended failures). Unsafe historical mappings are not restored, but their invalidated reviewed IDs conservatively block automatic settlement on a replacement; all historical occurrences are considered without source-order inheritance.
- **Final changed-code checks after all fixes**: `r1-r4-final-focused.log`: 3 webapp files / **61 tests passed**; `r1-r4-final-typecheck.log`: full webapp `tsc --noEmit --incremental false`, exit 0; `r1-r4-final-lint.log`: changed-file ESLint, exit 0. Root scraper/rulebook after integration: `r1-r4-root-postmerge.log`, 2 files / 5 tests passed. Earlier 59-test post-merge passing run is retained separately.
- **Broader attempt, not green**: `r1-r4-full-webapp.log` recorded 5 failures across input-set/source/fixed-constraint subprocess tests before the tool infrastructure timed out after 420s, without a completed suite total. No surviving task Vitest process was found afterward. Targeted repro `r1-r4-full-webapp-blocker.log` fails 2 fixed-constraint tests at `pnpm exec tsx`. Direct diagnostic returned `ERR_PNPM_UNSAFE_MODULES_DIR`: pnpm refused to remove the donor's resolved node_modules outside this worktree and aborted automatic reconciliation. An environment config attempt did not disable this behavior; no unsafe override, donor mutation or actual dependency installation was performed. Do not count this as a successful full-suite gate.
- Broad attempt supplied the existing primary worker environment explicitly with `UV_PROJECT_ENVIRONMENT=/home/timo/dev/click-tt-automation/webapp/worker/.venv`, `UV_NO_SYNC=1`, `UV_OFFLINE=1`, `PYTHONDONTWRITEBYTECODE=1`, scratch TMPDIR. No new worker environment.

Fresh SHA-bound independent review and full CI remain required before normal PR delivery. Full root/webapp suites, full lint/architecture/duplication/precommit, standalone fresh build/browser checks and real database concurrency/E2E are **not green gates established by this fix session**. PR67's remote CI success was supplied by the parent, not rerun here. No push, remote merge, deployment, gateway restart, credential access or board changes performed.

The parent repository's `reports/delivery/baseline/` receives the small raw logs and a final-SHA handoff. The committed worktree report records policy/history; exact final SHA is reported externally to avoid self-referencing a commit.
