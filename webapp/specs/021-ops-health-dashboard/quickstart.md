# Quickstart: Ops Health Dashboard

## Prerequisites

- Install dependencies with `pnpm install`.
- Generate Prisma client if needed with `pnpm run prisma:generate`.
- Seed or create a platform administrator account.
- Configure build metadata as desired:
  - `APP_ENVIRONMENT`
  - `APP_VERSION`
  - `APP_REVISION`
  - `APP_BUILD_ID`
  - `APP_BUILT_AT`

## Manual Validation

1. Start the app:

   ```powershell
   pnpm dev
   ```

2. Sign in as a platform administrator.

3. Open `/admin/ops` through the dashboard navigation.

4. Confirm the page shows:
   - Environment name
   - Version/revision/build id/build time where available
   - Snapshot timestamp
   - Overall status
   - Runtime, database, configuration, worker, and deploy smoke health areas
   - Unknown/unavailable states where optional evidence is absent
   - Configuration readiness as presence/readiness only, without raw environment values

5. Use the manual refresh action and confirm the snapshot timestamp changes.

6. Use the copy action and confirm a toast-style success message appears, then confirm the copied text contains no raw secrets, tokens, passwords, private keys, auth headers, cookies, or full connection strings.

7. Sign in as a non-admin user and confirm `/admin/ops` and `/api/admin/ops-health` are not accessible.

8. Confirm the dashboard has no horizontal overflow at mobile, tablet, and desktop widths.

## Automated Validation

Run focused tests for the implementation:

```powershell
pnpm test -- tests/unit/ops-health.test.ts tests/integration/ops-health-api.test.ts
pnpm test:e2e -- tests/e2e/ops-health/admin-ops-health.spec.ts
```

The focused e2e spec covers admin access, non-admin denial, manual refresh, copy feedback, and responsive overflow checks.

Run broader project validation before merge:

```powershell
.\validate.ps1 quality
.\validate.ps1 all
```

## Expected Safe Diagnostic Summary Shape

The copied summary should be plain text, compact, and suitable for issue reports:

```text
Environment: staging
Version: staging-42
Revision: abcdef123456
Build ID: 123.2
Built At: 2026-06-11T12:00:00.000Z
Captured At: 2026-06-11T15:24:00.000Z
Overall: healthy
runtime: healthy
database: healthy
configuration: healthy
worker: unknown
deploySmoke: unavailable
```

Forbidden examples:

- `DATABASE_URL=...`
- `Authorization: Bearer ...`
- Session cookie values
- Passwords or API keys
- Private key material
