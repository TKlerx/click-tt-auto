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

Independent fresh SHA-bound review and full CI remain required before normal PR delivery. No push, remote merge, deployment, gateway restart, credential access or board changes performed. Upstream PR67 integration and post-integration checks are recorded separately when complete.
