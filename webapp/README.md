# Raster Review Webapp

Downstream app skeleton copied from `C:\dev\webapp-template` for the Rasterzahl review and optimization workflow.

## Raster Flow

The `/raster` dashboard is the multi-user review surface for Rasterzahl work.
It currently supports:

- creating district-scoped input sets;
- uploading/pasting wishes as PDF-derived JSON or validated structured JSON;
- uploading fixed upper-league Rasterzahlen as structured rows;
- uploading and editing hall capacity as CSV rows;
- reviewing six-team groups as normal 6er or 6er Doppelrunde before generation;
- importing pre-computed snapshots with assignments and conflicts;
- starting generated optimization runs backed by the Python CP-SAT worker;
- reviewing assignments, hall-capacity conflicts, and review decisions;
- auditing raster input uploads, run starts, capacity changes, and review decisions.

The permission mapping uses the baseline roles:

- `PLATFORM_ADMIN`: raster admin; can upload inputs, import snapshots, start runs, edit capacity, review, and manage users.
- `SCOPE_ADMIN`: raster scheduler for assigned districts; can inspect data, edit capacity, and record review decisions, but cannot upload inputs, start runs, import snapshots, or manage users.
- `SCOPE_USER`: viewer for assigned districts; read-only.

The async `raster_run` worker job builds CP-SAT solver input from the reviewed season model, wishes, fixed Rasterzahlen, and hall capacities. Six-team groups are intentionally blocked until an admin confirms whether each group is a normal 6er or a 6er Doppelrunde; Doppelrunde uses the ten first-half matchdays from the PDF and is replanned after the mid-season break. Imported snapshots remain available for review and comparison.

Focused checks used during Raster work:

```powershell
pnpm --dir webapp run typecheck
pnpm --dir webapp exec vitest run tests/unit/wishes-schema.test.ts tests/unit/run-outcome.test.ts tests/unit/fixed-constraint.test.ts tests/unit/raster-input-sets-route.test.ts tests/unit/background-jobs-route.test.ts tests/unit/raster-input-sets-service.test.ts tests/unit/raster-penalties.test.ts
pnpm --dir webapp exec playwright test tests/e2e/raster-roles.spec.ts
cd webapp/worker; uv run python -m unittest tests.test_main.WorkerTests.test_worker_runtime_has_ortools tests.test_main.WorkerTests.test_process_raster_run_updates_run_status
```

A reusable internal web-app starter built from the extracted platform core of the original product.

Standalone template repo:

- `https://github.com/TKlerx/webapp-template`

Template provenance files:

- `TEMPLATE_VERSION.md`
- `.template-origin.json`
- refresh helper: `pnpm run template:stamp`

These files are intentionally committed into the template so copied repos still retain a visible upstream baseline even if Git history is removed.

## Includes

- Next.js 16 app router
- Prisma starter data model with SQLite for local development
- PostgreSQL-backed Docker deployment
- Go-based `starterctl` CLI with PAT-backed API access and GoReleaser packaging
- uv-managed Python worker skeleton for background jobs
- Azure SSO and local login
- mail abstraction layer with Microsoft Graph-backed shared mailbox read/send support
- role-based access control
- user administration
- dashboard home screen
- audit trail and export
- i18n, theme toggle, responsive UI
- Vitest, Playwright, Semgrep, duplication checks
- repo-local pnpm and uv dependency cooldown policy
- continuity workflow with `CONTINUE.md` and `CONTINUE_LOG.md`

## Base Spec

The repo baseline is documented in `specs/base/`:

- `specs/base/architecture.md`
- `specs/base/runtime-and-ops.md`

Read those files before creating new product-specific specs.

## Template Maintenance

Treat this repo as the upstream template for downstream apps created from it.

Recommended workflow:

1. Fix shared bugs in the downstream app where you discovered them.
2. Port the generic part of that fix back into this template repo as a small, focused commit.
3. Add or update tests in this template for that shared behavior.
4. Re-apply the same fix to other downstream apps by cherry-picking the focused commit or porting the same small diff.

Guidelines:

- Keep shared subsystems in similar paths across apps when possible.
- Separate template-worthy fixes from app-specific feature work.
- Prefer small commits such as `fix(auth): ...` over large mixed changes.
- If a subsystem like auth needs repeated cross-app fixes, consider extracting it into a shared package later.
- Downstream apps should keep `TEMPLATE_VERSION.md` and `.template-origin.json` so they know which upstream template commit they are based on.
- After creating a downstream app or after pulling upstream template fixes, run `pnpm run template:stamp` and commit the updated provenance files.

## Validation

```powershell
.\validate.ps1 precommit
.\validate.ps1 prepush
.\validate.ps1 all
.\validate.ps1 e2e
.\validate.ps1 full
```

Playwright E2E defaults to a local PostgreSQL container named
`click-tt-e2e-postgres` on host port `45432`. The E2E setup script
creates or starts that container, ensures the `business_app_starter_e2e_test`
database exists, resets that database, seeds the initial admin, and runs the app
with the Postgres Prisma schema. Use a separate database such as
`business_app_starter_manual` in the same container for manual exploratory
testing. Set an explicit `DATABASE_URL=file:./e2e.db` only when you intentionally
need the legacy SQLite E2E path. Set `E2E_REUSE_SERVER=1` only when you are not
resetting the database between runs.

`precommit` is the fast local hook phase: TypeScript typecheck,
dependency-cruiser architecture, and jscpd duplication.
`prepush` is the medium local hook phase: ESLint complexity/function-size
ratchets plus Python quality/complexity checks. Set
`RUN_FULL_VALIDATION_ON_PUSH=1` to run `full` before pushing instead.
`all` includes TypeScript, Python, and CLI quality checks plus dependency cooldown
validation for pnpm and uv support.
`full` also runs the Trivy supply-chain audit gate before production dependency
audits and E2E tests.

Quality checks can also be run independently:

```powershell
pnpm run quality:ts
pnpm run quality:python
pnpm run quality:cli
```

`quality:ts` runs blocking ESLint complexity, SonarJS cognitive-complexity,
function-size, and jscpd duplication thresholds plus dependency-cruiser
import-cycle analysis.
`quality:python` runs Ruff plus blocking Xenon and complexipy complexity
thresholds with Radon reporting for the worker package.
`quality:cli` runs Go formatting checks, `go vet`, Staticcheck, a blocking
gocyclo complexity threshold, `go test`, and `go build` for the CLI package.

Complexity thresholds are set to the current repo baseline and block
regressions by default:

- TypeScript cyclomatic complexity: 56
- TypeScript cognitive complexity: 24
- TypeScript function size: 520 nonblank, non-comment lines
- Python Xenon: max absolute F, max module C, max average B
- Python Radon cyclomatic complexity: 44
- Python complexipy cognitive complexity: 46
- CLI Go cyclomatic complexity: 15
- jscpd duplication: 3.7%

To bypass only the numeric threshold blockers during an intentional transition,
set `QUALITY_THRESHOLDS_BYPASS=1`. Formatting, lint correctness, tests, security
scans, and other non-threshold checks still run normally.

## CLI

The Go CLI lives in [`cli/`](./cli/) and has its own guide at [`cli/README.md`](./cli/README.md).

For day-to-day CLI usage, see the user guide at [`docs/cli-user-guide.md`](./docs/cli-user-guide.md).
It now starts with a short copy/paste CLI cheat sheet for the most common workflows.

That guide covers:

- building `starterctl`
- local PAT-based configuration
- smoke testing against `http://localhost:3270`
- manual cross-platform builds
- GoReleaser snapshot packaging

Create local GoReleaser archives with:

```powershell
pnpm run cli:dist
```

Install downloaded or locally built CLI release archives into the deployment
artifact folder with:

```powershell
$env:CLI_RELEASES_SOURCE_DIR='.\cli\dist'
pnpm run cli:install-releases
```

## Docker Deployment

- Local `pnpm run dev` uses SQLite via `DATABASE_URL=file:./dev.db`.
- Put Docker-only PostgreSQL and initial admin values in `.env.docker` using `.env.docker.example` as the template, then start Docker with `pnpm docker up`.
- Production-style Docker uses separate database URL names by runtime: `APP_DATABASE_URL`, `WORKER_DATABASE_URL`, and `MIGRATION_DATABASE_URL`.
- Docker services receive explicit allowlisted environment variables; the Postgres container only receives `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`.
- `pnpm docker build app migrate worker` builds the production app, migration, and worker images.
- `pnpm docker up -d worker` starts the Python background worker against the same Postgres database.
- Review [`docs/runtime-credentials.md`](./docs/runtime-credentials.md) before adding secrets to app, worker, or migration environments.
- `sh ./scripts/deploy.sh` now performs a pre-deploy PostgreSQL dump, applies migrations, and restarts the app and worker. Set `CLI_RELEASES_BUILD_DURING_DEPLOY=docker` to build `starterctl` release archives in a GoReleaser container, `CLI_RELEASES_BUILD_DURING_DEPLOY=true` to build with host tools, or `CLI_RELEASES_SOURCE_DIR=/path/to/artifacts` to install prebuilt archives.
- Manual PostgreSQL backup: `sh ./scripts/backup-postgres.sh`. Dumps are written to `./backups/postgres/business-app-starter-<UTC-timestamp>.dump` and validated with `pg_restore -l`.
- Guarded PostgreSQL restore: `RESTORE_CONFIRM=restore BACKUP_FILE=./backups/postgres/business-app-starter-<timestamp>.dump sh ./scripts/restore-postgres.sh`. The restore script validates the dump, takes a safety backup unless `SKIP_PRE_RESTORE_BACKUP=true`, restores with `pg_restore --clean --if-exists`, reruns Prisma migration/seed steps, and restarts runtime services by default.

## Mail Integration

- The current mail abstraction lives under [`src/lib/mail`](./src/lib/mail/) and currently supports the `graph` provider only.
- The first implementation supports reading mailbox messages and sending mail through Microsoft Graph with application credentials.
- Configure `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_TENANT_ID`, `MAIL_PROVIDER=graph`, and `MAIL_DEFAULT_MAILBOX` in your environment.
- For shared mailboxes, assign the needed Graph mail permissions to the Entra app and scope access appropriately in Exchange.
- See [`docs/mail.md`](./docs/mail.md) for the current abstraction shape, environment variables, permissions, and sample usage.

## Monitoring And Logging

- Request IDs are assigned in middleware and returned as the `x-request-id` response header.
- Structured JSON logs are emitted through `src/lib/logger.ts` and redact common secrets automatically. See [`docs/logging.md`](./docs/logging.md) for event naming, safe metadata, worker logging, and guardrail rules.
- Runtime process failures are captured in `src/instrumentation.ts`.
- Health checks are exposed at `/api/health` with process and database status.
- Build metadata is exposed at `/api/version` and shown in the app badge from `APP_ENVIRONMENT`, `APP_VERSION`, `APP_REVISION`, `APP_BUILD_ID`, and `APP_BUILT_AT`; CI/deploys should set these from the commit, run id, and release/tag instead of committing generated version files.
- `LOG_LEVEL` controls severity filtering. `ENABLE_REQUEST_LOGGING=true` enables opt-in request completion logs.

## Dependency Safety

- pnpm is configured with a 7-day package release delay through `.npmrc`
- uv worker resolution is configured with `exclude-newer = "1 week"`
- `validate.ps1` fails if the installed pnpm or uv version does not support those controls
- Trivy runs from a repo-pinned digest image and must satisfy the same 7-day
  scanner release cooldown. Override only with
  `-AllowTrivyCooldownOverride` for an approved emergency.
- Trivy runtime image scans block fixable High/Critical vulnerabilities; unfixed
  distro findings are ignored by the gate until an upstream fix exists.

Run the Trivy gate directly when you only need image/IaC supply-chain checks:

```powershell
pnpm run supply-chain:audit
```

Reports are written under `.artifacts/supply-chain-audit/`.

## Suggested Next Step

Clone the standalone template repo and continue product-specific work from there instead of from the original worktree.
