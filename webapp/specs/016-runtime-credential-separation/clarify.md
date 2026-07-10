# Clarifications: Runtime Credential Separation

## Session 2026-05-27

- Q: Should this copy the full `rag-agent` runtime least-privilege scope? -> A: No. Keep this template-focused: app, worker, migration/provisioning, and local-development credential separation.
- Q: What is the MVP boundary? -> A: Split database URL ownership first with `APP_DATABASE_URL`, `WORKER_DATABASE_URL`, and `MIGRATION_DATABASE_URL`.
- Q: Should local development require all runtime-specific URLs? -> A: No. Local development may keep `DATABASE_URL=file:./dev.db` as the fallback.
- Q: Should Microsoft Graph and Teams credentials be forced into separate app registrations? -> A: No. Document runtime ownership and allow explicit small-deployment exceptions where current flows share identity settings.
