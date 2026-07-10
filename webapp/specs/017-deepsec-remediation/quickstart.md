# Quickstart: DeepSec Remediation Plan

## Prerequisites

- Work on branch `017-deepsec-remediation`.
- Review `CONTINUE.md` and `ACTIVE_SPECS.md` before implementation.
- Keep `.deepsec/findings-full-codex.json` available as the baseline export.

## Phase 1 Implementation Order

1. Protect delegated integration secrets in background jobs.
   - Remove secret material from new job payloads.
   - Redact job read surfaces.
   - Clean historical stored sensitive payload values.
   - Add tests proving job APIs, dashboard data, and logs do not expose delegated credentials.

2. Preserve last-admin invariants atomically.
   - Cover deactivation and role-change flows.
   - Add concurrent-operation tests proving at least one active platform administrator remains.

3. Bound audit listing and export.
   - Apply safe defaults and maxima to list/export inputs.
   - Return bounded exports with truncation or narrowing guidance.
   - Add tests for malformed, broad, and oversized requests.

4. Harden login rate-limit identity.
   - Ignore forwarded identity headers unless trusted proxy mode is explicitly enabled.
   - Add tests for default and trusted-proxy modes.

5. Harden release automation.
   - Split validation/build from publishing.
   - Pin external actions and release tooling to immutable approved versions.
   - Validate write permissions are isolated to publishing.

6. Preserve fixed auth findings.
   - Rerun existing mock SSO and CLI browser-login tests.
   - Force-revalidate fixed DeepSec findings if the report still contains stale records.

## Local Validation

Run the standard project checks:

```powershell
pnpm run typecheck
pnpm run lint
pnpm test
```

Run focused checks expected for Phase 1:

```powershell
pnpm vitest run tests/integration/cli-auth.test.ts
pnpm playwright test tests/e2e/auth/cli-sso-flow.spec.ts
```

Add targeted tests during task generation for:

- Background job secret redaction and cleanup.
- Last-admin concurrent role/status changes.
- Audit export/list bounds and truncation messaging.
- Login rate-limit trusted proxy behavior.
- Release workflow permission and pinning review.

## DeepSec Validation

After Phase 1 fixes and local tests pass, refresh scanner evidence:

```powershell
cd .deepsec
pnpm deepsec scan --project-id webapp-template
pnpm deepsec process --project-id webapp-template --agent codex
pnpm deepsec revalidate --project-id webapp-template --min-severity HIGH --agent codex --force
pnpm deepsec revalidate --project-id webapp-template --min-severity HIGH_BUG --agent codex --force
pnpm deepsec export --project-id webapp-template --format json --out findings-full-codex.json
pnpm deepsec export --project-id webapp-template --format md-dir --out findings-full-codex
```

If a full process pass is too costly, use focused filters for the touched Phase 1 paths and record the limitation in `CONTINUE_LOG.md`.

## Completion Criteria

Phase 1 is complete when:

- No unresolved unactioned HIGH findings remain in the refreshed export.
- No unresolved unactioned HIGH_BUG findings remain in the refreshed export.
- Previously fixed mock SSO and CLI browser-login findings remain fixed.
- Local tests and standard validation pass.
- `CONTINUE.md`, `CONTINUE_LOG.md`, and scanner exports are refreshed.

Phase 2 starts after Phase 1 by generating a new task slice for MEDIUM and BUG findings under the same spec.
