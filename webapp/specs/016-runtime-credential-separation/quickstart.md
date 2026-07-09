# Quickstart: Runtime Credential Separation

## Goal

Verify that app, worker, and migration contexts can run with separate credential names while local development keeps a simple fallback.

## Static Review

1. Review `specs/016-runtime-credential-separation/contracts/runtime-credential-contract.md`.
2. Confirm `.env.example`, `.env.docker.example`, and `docker-compose.yml` use the same database variable names.
3. Confirm runtime-specific docs explain local fallback and production-style expectations.

## Expected Environment Shape

```env
APP_DATABASE_URL=postgresql://app:...@postgres:5432/business_app_starter?connection_limit=10
WORKER_DATABASE_URL=postgresql://worker:...@postgres:5432/business_app_starter?connection_limit=10
MIGRATION_DATABASE_URL=postgresql://migrator:...@postgres:5432/business_app_starter?connection_limit=2
DATABASE_URL=file:./dev.db
```

## Validation Commands

```powershell
pnpm run validate:runtime-credentials
pnpm run typecheck
pnpm test
cd worker; uv run python -m unittest tests.test_main
docker compose config
```

## Manual Smoke

1. Start production-style Compose with separate database URL variables.
2. Confirm the migration service completes.
3. Confirm the app serves `/api/health`.
4. Confirm the worker starts and polls without requiring app-only SSO secrets.
5. Confirm app auth, background jobs, mail, and Teams flows still work where configured.
