# Best Practices Review

Reviewed: 2026-04-21 (pass 2)

Guidelines applied:

- Vercel Web Interface Guidelines
- Vercel React & Next.js Best Practices (69 rules across 8 categories)
- Next.js Best Practices (App Router, RSC, async patterns, self-hosting, error handling, bundling)
- Better Auth Best Practices (security, session, CSRF, trusted origins)
- Building Components (accessibility, composition, state management)
- Docker Expert (multi-stage builds, security hardening, compose orchestration, image optimization)
- Prisma Client API (queries, filtering, relations, transactions)
- Playwright Best Practices (locators, assertions, fixtures, authentication, flaky prevention, Next.js patterns)
- Frontend Design (typography, color, motion, spatial composition, visual details)

## Summary

| Category                 | Findings |
| ------------------------ | -------- |
| Accessibility            | 6        |
| Forms                    | 4        |
| Next.js / RSC            | 8        |
| Performance              | 4        |
| Dark Mode & Theming      | 2        |
| Better Auth              | 3        |
| Web Interface Guidelines | 4        |
| Docker                   | 16       |
| Prisma                   | 9        |
| Playwright E2E           | 13       |
| Frontend Design          | 10       |
| **Total**                | **79**   |

---

## Accessibility

### A1: Navigation links missing focus-visible ring

**Severity:** Medium
**File:** `src/components/ui/Navigation.tsx:28`

Nav `<Link>` elements have no `focus-visible:ring-*` style. Keyboard users cannot see which link is focused.

```tsx
// Current
<Link className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 ..." href={link.href}>

// Recommended — add focus-visible ring
<Link className="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 ... focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none" href={link.href}>
```

### A2: Toast notifications missing aria-live

**Severity:** Medium
**File:** `src/components/ui/Toast.tsx:28`

Toast container should have `role="status"` and `aria-live="polite"` so screen readers announce new toasts.

```tsx
// Current
<div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">

// Recommended
<div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
```

### A3: CreateUserDialog inputs missing labels

**Severity:** Medium
**File:** `src/components/auth/CreateUserDialog.tsx:107-146`

Dialog inputs use `placeholder` instead of `<label>`. Screen readers cannot identify these fields. The email, name, and password inputs all lack associated labels.

```tsx
// Current
<Input placeholder={t("emailPlaceholder")} type="email" ... />

// Recommended — add labels
<label className="block text-sm font-medium" htmlFor="create-email">{t("email")}</label>
<Input id="create-email" placeholder={t("emailPlaceholder")} type="email" ... />
```

### A4: AuditTrailViewer filter inputs missing labels

**Severity:** Medium
**File:** `src/components/audit/AuditTrailViewer.tsx:43-54`

Both filter `<input>` elements use placeholder text only — no `<label>` or `aria-label`.

```tsx
// Recommended
<label className="sr-only" htmlFor="audit-action">{t("action")}</label>
<input id="audit-action" ... />
```

### A5: ChangePasswordForm inputs wrapped in label but missing htmlFor

**Severity:** Low
**File:** `src/components/auth/ChangePasswordForm.tsx:42-54`

Labels wrap their inputs (which works for association), but the inputs lack `autocomplete` attributes. Password fields should have `autocomplete="current-password"` and `autocomplete="new-password"` respectively.

```tsx
// Current
<Input className="mt-2" type="password" value={currentPassword} ... />

// Recommended
<Input className="mt-2" type="password" autoComplete="current-password" value={currentPassword} ... />
```

### A6: NotificationAdminPanel SelectTriggers missing aria-label

**Severity:** Low
**File:** `src/components/notifications/NotificationAdminPanel.tsx:193,216`

The event type and status filter `<SelectTrigger>` elements have no `aria-label`. The `<SelectValue placeholder={...}>` is visual-only.

---

## Forms

### F1: CreateUserDialog email input missing autocomplete and spellCheck

**Severity:** Low
**File:** `src/components/auth/CreateUserDialog.tsx:107-111`

Email input should have `autoComplete="email"` and `spellCheck={false}`. Password input should have `autoComplete="new-password"`.

### F2: CreateUserDialog lacks loading state on submit button

**Severity:** Low
**File:** `src/components/auth/CreateUserDialog.tsx:150`

Submit button has no `disabled` or spinner state during submission. Per web interface guidelines: "Submit button stays enabled until request starts; spinner during request."

### F3: UserManagementTable deactivate action lacks confirmation

**Severity:** Medium
**File:** `src/components/auth/UserManagementTable.tsx:147-162`

Deactivating a user is a destructive action (locks them out) but has no confirmation dialog or undo window. Per guidelines: "Destructive actions need confirmation modal or undo window."

### F4: Token delete action uses window.confirm

**Severity:** Low
**File:** `src/components/tokens/token-list.tsx:119`

`window.confirm()` works but is a browser modal that cannot be styled and may be blocked. Consider using a confirmation dialog component for consistency with the rest of the UI.

---

## Next.js / RSC

### N1: Root layout html lang attribute is hardcoded to "en"

**Severity:** Medium
**File:** `src/app/layout.tsx:25`

The app supports 5 locales via next-intl, but `<html lang="en">` is always English. Should use the resolved locale.

```tsx
// Current
<html lang="en" suppressHydrationWarning>

// Recommended — pass locale from SessionLayout or resolve in RootLayout
<html lang={locale} suppressHydrationWarning>
```

### N2: Missing meta theme-color tag

**Severity:** Low
**File:** `src/app/layout.tsx`

No `<meta name="theme-color">` set. Per web interface guidelines, this should match the page background color and update with dark mode.

### N3: Swagger UI loaded via manual DOM manipulation

**Severity:** Low
**File:** `src/components/docs/swagger-ui.tsx:13-52`

Third-party scripts (Swagger UI CSS/JS) loaded via `document.createElement`. Should use `next/script` with `strategy="lazyOnload"` for better loading control and Next.js integration.

### N4: BackgroundJobsPage uses hardcoded locale in Intl.DateTimeFormat

**Severity:** Low
**File:** `src/app/(dashboard)/background-jobs/page.tsx:190`

```ts
return new Intl.DateTimeFormat("en", { ... }).format(value);
```

Hardcoded `"en"` instead of using the resolved locale. Other components correctly use `undefined` (browser default) but this one is pinned to English.

### N5: No error boundaries anywhere in the app

**Severity:** High
**Files:** entire `src/app/` tree

Zero `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `loading.tsx` files exist. Per Next.js best practices:

- `error.tsx` — catches runtime errors per route segment, shows recovery UI instead of a blank page.
- `global-error.tsx` — catches errors in root layout itself (required because `error.tsx` cannot catch root layout errors).
- `not-found.tsx` — custom 404 page instead of the default Next.js one.
- `loading.tsx` — instant loading skeleton while async server components resolve.

Without these, any runtime error surfaces the default Next.js error page with no recovery option. Users see a generic error with no way back except manually navigating.

```
// Minimum recommended:
src/app/error.tsx           — catch-all error boundary with "try again" button
src/app/global-error.tsx    — root layout error boundary
src/app/not-found.tsx       — custom 404
src/app/(dashboard)/loading.tsx — skeleton for dashboard pages
```

### N6: Missing `output: 'standalone'` for Docker deployment

**Severity:** Medium
**File:** `next.config.ts`

The app deploys via Docker (`Dockerfile.app` exists) but `next.config.ts` does not set `output: 'standalone'`. Per Next.js self-hosting docs, standalone output creates a minimal production server that doesn't require `node_modules` at runtime — significantly smaller Docker images and faster cold starts.

```ts
// Recommended
const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  // ...
};
```

### N7: UsersPage serializes full Prisma user objects to client

**Severity:** Medium (security + performance)
**File:** `src/app/(dashboard)/users/page.tsx:16`

```ts
const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
```

No `select` clause — passes all user fields to the `UserManagementTable` client component. The client component only needs `id`, `name`, `email`, `role`, `status`, `authMethod`, but the full Prisma result may include password hashes and other sensitive fields in the serialized RSC payload.

Per Vercel React best practices (`server-serialization`): minimize data passed from server to client components.

```ts
// Recommended
const users = await prisma.user.findMany({
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    authMethod: true,
  },
});
```

### N8: AuditTrailViewer fetches all rows without pagination

**Severity:** Medium
**File:** `src/components/audit/AuditTrailViewer.tsx:35`

Client-side fetch to `/api/audit` has no `take` or pagination parameter. If audit log grows large, this will serialize and transfer the entire result set. Should add server-side pagination or at minimum a `take` limit.

---

## Performance

### P1: AuditTrailViewer fetches on every filter keystroke

**Severity:** Medium
**File:** `src/components/audit/AuditTrailViewer.tsx:34-37`

The `useEffect` fires a fetch on every character typed in the filter inputs (no debounce). This creates excessive network requests and potential race conditions.

```tsx
// Recommended — add debounce or switch to submit-on-enter
const debouncedQuery = useDeferredValue(queryString);
useEffect(() => { ... }, [debouncedQuery]);
```

### P2: Swagger UI assets loaded from unpkg CDN without preconnect

**Severity:** Low
**File:** `src/components/docs/swagger-ui.tsx:19,44`

Loading from `unpkg.com` without `<link rel="preconnect">`. Add preconnect hint for the CDN domain.

### P3: Notification and token tables not virtualized

**Severity:** Info
**Files:** `src/components/notifications/NotificationAdminPanel.tsx`, `src/components/tokens/token-list.tsx`

Currently limited by server-side pagination/take limits (25 items). Not a problem now but worth noting if limits increase beyond ~50 rows.

### P4: AuditTrailViewer fetch has no error handling or race condition guard

**Severity:** Low
**File:** `src/components/audit/AuditTrailViewer.tsx:34-37`

The `useEffect` fetch chain uses `.then()` with no `.catch()` and no abort controller. Fast typing creates overlapping requests that can resolve out of order, showing stale results. Combined with P1 (no debounce), this creates both excessive requests and potential data inconsistency.

```tsx
// Recommended — abort controller + error handling
useEffect(() => {
  const controller = new AbortController();
  void fetch(url, { signal: controller.signal })
    .then((r) => r.json())
    .then((payload) => setRows(payload.data ?? []))
    .catch(() => {});
  return () => controller.abort();
}, [debouncedQuery]);
```

---

## Dark Mode & Theming

### D1: Theme set via data attribute only, missing color-scheme on html

**Severity:** Low
**File:** `src/components/providers/ThemeProvider.tsx:26`

The provider sets `document.documentElement.dataset.theme` but does not update `document.documentElement.style.colorScheme`. This means native elements (scrollbars, form controls) may not match the theme on some browsers.

```tsx
// Recommended — also set color-scheme
useEffect(() => {
  document.documentElement.dataset.theme = theme.toLowerCase();
  document.documentElement.style.colorScheme = theme.toLowerCase();
}, [theme]);
```

Note: The CSS has `color-scheme: light dark` on `:root`, but this sets it to "auto" — it should be explicitly `light` or `dark` based on the active theme.

### D2: LocaleSwitcher has encoding issue in locale labels

**Severity:** Medium (display bug)
**File:** `src/components/ui/LocaleSwitcher.tsx:19-21`

```ts
es: "EspaÃ±ol",    // Should be: "Español"
fr: "FranÃ§ais",   // Should be: "Français"
pt: "PortuguÃªs",  // Should be: "Português"
```

UTF-8 characters appear mojibaked. This is likely a file encoding issue — the file was saved as Latin-1 or read without proper UTF-8 handling.

---

## Better Auth

### BA1: Missing trustedOrigins configuration

**Severity:** Medium
**File:** `src/lib/better-auth.ts:44-126`

Better Auth config has no `trustedOrigins` set. Per Better Auth best practices, CSRF protection should include an explicit trusted origins whitelist, especially when deployed behind a reverse proxy with a different public origin than `AUTH_BASE_URL`.

```ts
// Recommended
export const auth = betterAuth({
  ...
  trustedOrigins: [getConfiguredAuthBaseUrl()],
});
```

### BA2: No session cookie cache configured

**Severity:** Low
**File:** `src/lib/better-auth.ts:44-126`

No `session.cookieCache` configured. Every request hits the database to validate the session. For an internal business app this is acceptable, but enabling cookie cache (e.g., `{ maxAge: 300 }`) would reduce database load.

### BA3: No rate limiting configured in Better Auth itself

**Severity:** Low
**File:** `src/lib/better-auth.ts:44-126`

Better Auth has built-in rate limiting (enabled by default in production), but no `rateLimit` config is set — relying entirely on defaults (100 req/10s globally, 3 req/10s for sensitive endpoints). The app has its own custom rate limiting on `/api/auth/login` and `/api/cli-auth/token`, but Better Auth's own endpoints (`/api/auth/sign-in/email`, `/api/auth/change-password`, etc.) use only the built-in defaults.

Consider explicitly configuring `rateLimit.storage: "database"` if deploying multi-instance, since the default `"memory"` storage has the same limitations as the app's custom rate limiter.

---

## Web Interface Guidelines

### W1: Button component focus ring — verified OK

**Severity:** None (resolved on verification)
**File:** `src/components/ui/Button.tsx:12-17`

Pass 1 flagged this as potentially missing. Pass 2 verified: the shadcn `button.tsx` base includes `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` in the CVA base class. The custom `Button` wrapper uses `cn()` to merge classes but does not add conflicting `focus-visible:*` overrides, so the base ring is preserved. No action needed.

### W2: Number columns missing tabular-nums

**Severity:** Low
**Files:** `src/app/(dashboard)/background-jobs/page.tsx`, `src/components/notifications/NotificationAdminPanel.tsx`

Summary cards with numeric values (job counts, notification counts) should use `font-variant-numeric: tabular-nums` for consistent alignment. Apply via Tailwind: `tabular-nums`.

### W3: Ellipsis characters not used in loading states

**Severity:** Low
**Files:** Various translation files

Loading text strings should end with `…` (unicode ellipsis U+2026), not `...` (three dots). Verify in `src/i18n/messages/*.json` that loading/saving states use the proper character.

### W4: Missing skip-to-content link

**Severity:** Low
**File:** `src/app/(dashboard)/layout.tsx`

No skip navigation link for keyboard users. Per guidelines: "Include skip link for main content."

```tsx
// Recommended — add before the header
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-[var(--accent-foreground)]">
  Skip to content
</a>
...
<div id="main-content" className="mt-8 sm:mt-10">{children}</div>
```

---

## Docker

### D1: No `output: 'standalone'` — full node_modules shipped in image

**Severity:** Medium
**File:** `Dockerfile.app:33-35`, `next.config.ts`

Runner stage copies entire `.next` dir and full prod `node_modules`. With Next.js `output: 'standalone'`, the build produces a self-contained folder (~50-80MB) instead of shipping full `node_modules` (~200-400MB+). Significantly smaller images, faster pulls, faster cold starts.

```dockerfile
// Current — runner copies full node_modules
COPY --from=prod-deps /app/node_modules ./node_modules
CMD ["pnpm", "run", "start"]

// With standalone — only standalone output + static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
CMD ["node", "server.js"]
```

Requires `output: "standalone"` in `next.config.ts`. Also eliminates D6 (package manager as PID 1).

### D2: No HEALTHCHECK in Dockerfile.app

**Severity:** Medium
**Files:** `Dockerfile.app:47-48`

Neither `runner` nor `migrate-runner` stages define a `HEALTHCHECK`. Docker/orchestrators cannot detect if the app is actually responding. Container shows "running" even if the Node process is deadlocked.

```dockerfile
// Recommended — add to runner stage
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3270/api/auth/ok || exit 1
```

Note: Requires `curl` installed in the base stage, or use a Node-based healthcheck script.

### D3: Base image not version-pinned

**Severity:** Low
**File:** `Dockerfile.app:1`

`node:20-slim` floats to latest Node 20.x patch. A rebuild tomorrow may produce a different binary. Pin to specific version for reproducible builds.

```dockerfile
// Current
FROM node:20-slim AS base

// Recommended
FROM node:20.19.0-slim AS base
```

### D4: pnpm store not cleaned after install

**Severity:** Info
**File:** `Dockerfile.app:7,28`

`pnpm install` can leave store data in intermediate layers. Not shipped in final image (multi-stage), but can inflate build cache on CI.

```dockerfile
RUN pnpm install --frozen-lockfile --no-optional && pnpm store prune
```

### D5: Build context includes unnecessary files

**Severity:** Low
**File:** `.dockerignore`

Builder stage uses `COPY . .` — .dockerignore controls what enters the build context. Currently missing exclusions for: `docs/`, `tests/`, `.claude/`, `.agents/`, `.specify/`, `*.md`, `docker-compose.yml`, `.github/`. Adds unnecessary files to build context and can bust layer cache when docs/tests change.

```
// Add to .dockerignore
docs/
tests/
.claude/
.agents/
.specify/
.github/
*.md
docker-compose.yml
```

### D6: package manager as PID 1 — no graceful shutdown

**Severity:** Medium
**File:** `Dockerfile.app:48`

Package-manager launchers as PID 1 do not reliably forward SIGTERM to the child Node process. On container stop, Docker waits 10s then sends SIGKILL — no graceful shutdown of connections or in-flight requests.

Fix options:

1. Use `output: 'standalone'` and `CMD ["node", "server.js"]` (fixes D1 too)
2. Add `tini` as init: `RUN apt-get install -y tini` + `ENTRYPOINT ["tini", "--"]`
3. Use `--init` flag in docker-compose

### D7: Worker container runs as root

**Severity:** Medium
**File:** `Dockerfile.worker`

No `USER` instruction, no non-root user created. Container runs everything as root. Inconsistent with the app container which correctly runs as `nextjs:nodejs`.

```dockerfile
// Add before CMD
RUN groupadd --system --gid 1001 worker \
    && useradd --system --uid 1001 --gid worker worker
USER worker
```

### D8: Worker container missing HEALTHCHECK

**Severity:** Low
**File:** `Dockerfile.worker`

No HEALTHCHECK. Orchestrator cannot detect if worker process is alive. Less critical than app (no HTTP), but a simple process check would help.

### D9: Python base image not version-pinned

**Severity:** Low
**File:** `Dockerfile.worker:1`

`python:3.12-slim` floats. Same issue as D3.

### D10: Unused curl installed in worker

**Severity:** Info
**File:** `Dockerfile.worker:5`

`apt-get install -y curl` but nothing uses it. Adds attack surface and image size for no benefit. Remove, or use it for a HEALTHCHECK.

### D11: No healthcheck for app service in Compose

**Severity:** Medium
**File:** `docker-compose.yml:64-89`

Postgres has `healthcheck`, but the app service has none. If a future reverse proxy or dependent service needs to wait for the app to be ready, there's no mechanism. Docker also can't auto-restart an unresponsive (but technically running) app container.

```yaml
# Recommended — add to app service
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3270/api/auth/ok"]
  interval: 30s
  timeout: 10s
  start_period: 15s
  retries: 3
```

### D12: No resource limits on any service

**Severity:** Low
**File:** `docker-compose.yml`

No `deploy.resources.limits` defined. A memory leak, runaway query, or excessive logging could consume all host resources and take down the entire stack.

```yaml
# Recommended — add to each service
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

### D13: `internal` network is not actually internal

**Severity:** Medium
**File:** `docker-compose.yml:116-117`

Network named `internal` uses `driver: bridge` but does not set `internal: true`. All containers on this network can reach the internet. Postgres and the worker should not need outbound internet access.

```yaml
// Current
networks:
  internal:
    driver: bridge

// Recommended — split into two networks
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
```

App joins both (needs port exposure on frontend, DB access on backend). Postgres and worker join backend only.

### D14: Postgres volume path non-standard

**Severity:** Info
**File:** `docker-compose.yml:28`

Volume mounts to `/var/lib/postgresql` instead of standard `/var/lib/postgresql/data`. Works because postgres creates the `data` subdir automatically, but differs from the official postgres image documentation and could cause confusion.

### D15: Duplicate validation logic in Compose commands

**Severity:** Low
**File:** `docker-compose.yml:50-58,82-89,107-114`

Identical `DATABASE_URL` and `POSTGRES_PASSWORD` validation shell scripts duplicated verbatim across app, worker, and migrate services. Extract to a shared entrypoint script for maintainability.

```dockerfile
// In Dockerfile.app, add shared entrypoint:
COPY scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
```

### D16: .dockerignore missing common exclusions

**Severity:** Low
**File:** `.dockerignore`

Currently excludes core paths but misses several directories that inflate build context:

| Missing              | Size impact          |
| -------------------- | -------------------- |
| `docs/`              | Documentation        |
| `tests/`             | Test suites          |
| `.claude/`           | AI config            |
| `.agents/`           | AI skills            |
| `.specify/`          | Design system config |
| `*.md`               | Markdown files       |
| `docker-compose.yml` | Compose config       |

---

---

## Prisma

### PR1: Redundant index on tokenHash

**Severity:** Low
**File:** `prisma/schema.prisma:217`

`tokenHash` has `@unique` which implicitly creates an index. The explicit `@@index([tokenHash])` is redundant — Prisma generates both a unique constraint and an index, resulting in a duplicate index in the database.

```prisma
// Current
tokenHash    String      @unique
// ...
@@index([tokenHash])  // ← redundant, @unique already indexes

// Recommended — remove the @@index line
```

### PR2: Inconsistent select scoping between page and service layer

**Severity:** Low
**Files:** `src/app/(dashboard)/users/page.tsx:16`, `src/services/api/user-admin.ts:43-56`

The `listUsers()` service function correctly fetches all fields then maps to a safe subset before returning. But `users/page.tsx` bypasses the service and calls `prisma.user.findMany()` directly with no `select`, passing raw Prisma results to the client component. Related to finding N7.

Pattern inconsistency: some pages use service functions (which scope fields), others query Prisma directly (which don't).

### PR3: Audit export loads entire audit trail into memory

**Severity:** Medium
**File:** `src/lib/audit-export.ts:48-49, 82-83`

`exportToCSV()` and `exportToPDF()` call `getAuditEntries()` without pagination parameters. The query has no `take` limit when `filters.page` and `filters.limit` are absent. For a growing audit log (thousands of entries over months), this loads everything into memory for CSV/PDF generation.

```ts
// Current — no pagination = all rows
const { entries } = await getAuditEntries(filters);

// Recommended — add a hard cap or stream
const { entries } = await getAuditEntries({ ...filters, limit: 10000 });
```

Also: the PDF generator uses a single-page layout (`/Pages /Kids [3 0 R] /Count 1`). More than ~55 entries overflow the page without multi-page support.

### PR4: Sequential upserts in ensureNotificationTypeConfigurations

**Severity:** Low
**File:** `src/services/notifications/admin.ts:78-90`

Loops through notification event types with sequential `await` inside a `for` loop. Each upsert is an independent database round-trip.

```ts
// Current — sequential
for (const eventType of SUPPORTED_NOTIFICATION_EVENT_TYPES) {
  await delegate.upsert({ ... });
}

// Recommended — parallel
await Promise.all(
  SUPPORTED_NOTIFICATION_EVENT_TYPES.map((eventType) =>
    delegate.upsert({ ... })
  )
);
```

Minor for 3-4 event types currently, but pattern doesn't scale.

### PR5: NotificationTypeConfiguration accessed via unsafe type cast

**Severity:** Medium
**File:** `src/services/notifications/admin.ts:42-48`

```ts
function notificationTypeConfigurations(): NotificationTypeConfigurationDelegate {
  return (
    prisma as unknown as {
      notificationTypeConfiguration: NotificationTypeConfigurationDelegate;
    }
  ).notificationTypeConfiguration;
}
```

Double cast (`as unknown as`) bypasses all type safety. If the model is renamed, removed, or fields change, no compile error — only a runtime crash. Likely a workaround for a Prisma client generation issue. Should investigate why the generated client doesn't expose this model directly.

### PR6: Dual schema files must be kept in sync manually

**Severity:** Medium
**Files:** `prisma/schema.prisma`, `prisma/schema.postgres.prisma`

Two schema files are identical except for `datasource.provider` (`sqlite` vs `postgresql`). Any model, enum, or index change must be applied to both files manually. No CI check or script validates they stay in sync.

Options:

1. Script that generates one from the other (swap the datasource line)
2. CI step that diffs the two files (ignoring the datasource block)
3. Single schema with environment-driven provider selection (Prisma 7 may support this via config)

### PR7: AuditEntry `details` stored as String instead of Json

**Severity:** Low
**File:** `prisma/schema.prisma:188`

`details` is `String` containing JSON. Works, but:

- No database-level JSON validation
- Cannot use Prisma's JSON filtering (`path`, `array_contains`, etc.) on PostgreSQL
- Query code must parse manually

SQLite doesn't support `Json` type, which explains the choice. But `schema.postgres.prisma` could use `Json` for the PostgreSQL deployment while keeping `String` in the SQLite schema.

### PR8: Hard deletes cascade — no soft delete pattern

**Severity:** Info
**Files:** `prisma/schema.prisma` (User model relations)

User deletion cascades to: sessions, accounts, tokens, scope assignments, CLI auth codes. Audit entries correctly use `onDelete: Restrict` (preventing user deletion when audit trail exists), and background jobs use `onDelete: SetNull`.

Not a problem for an internal business app, but worth noting: if a user is ever deleted, all their tokens, sessions, and scope assignments vanish immediately with no recovery path. The `Restrict` on audit entries effectively prevents user deletion in practice, which is the right safeguard.

### PR9: Prisma client singleton missing $disconnect on shutdown

**Severity:** Info
**File:** `src/lib/db.ts`

Singleton client with dev-mode global caching pattern (correct for Next.js). No `$disconnect()` on process exit. Fine in practice — Next.js manages its own lifecycle, and the connection pool adapter handles cleanup. But if the app is used outside Next.js (scripts, tests), connections may leak.

---

## Playwright E2E

### PW1: `networkidle` used in loginWithSso helper

**Severity:** Medium
**File:** `tests/e2e/helpers/auth.ts:24`

`loginWithSso` uses `{ waitUntil: "networkidle" }` — a known anti-pattern per Playwright docs. `networkidle` waits for zero in-flight requests for 500ms, which is fragile (any background polling, analytics, or WebSocket activity prevents it from resolving) and slow (always waits at least 500ms even when the page is ready).

```ts
// Current
await page.goto(url, { waitUntil: "networkidle" });

// Recommended — wait for specific URL or element instead
await page.goto(url);
await expect(page).toHaveURL(/\/(dashboard|pending)$/, { timeout: 15000 });
```

Also used in `cli-sso-flow.spec.ts:27`.

### PW2: No authentication storage state reuse

**Severity:** Medium
**Files:** all spec files

Every test logs in from scratch: `seedLocalUser()` → `loginWithPassword()` → wait for dashboard. With 14 tests running sequentially (`workers: 1`), this adds significant overhead. Playwright's recommended pattern is to save authentication state (`storageState`) once per role and reuse it across tests.

```ts
// Recommended — create auth setup projects in playwright.config.ts
{
  projects: [
    { name: "admin-setup", testMatch: /admin\.setup\.ts/ },
    {
      name: "admin-tests",
      dependencies: ["admin-setup"],
      use: { storageState: ".auth/admin.json" },
    },
  ];
}
```

Not all tests can use this (e.g., `local-login.spec.ts` tests the login flow itself), but admin tests, token tests, API docs, and RBAC tests would benefit.

### PW3: Swallowed assertion in token test

**Severity:** Medium
**File:** `tests/e2e/token-management.spec.ts:44`

```ts
await expect(tokenRow)
  .toContainText("abcdef", { timeout: 1000 })
  .catch(() => {});
```

`.catch(() => {})` silently swallows a failed assertion. If this check matters, remove the catch. If it doesn't matter, remove the entire line. Silent failures mask real regressions.

### PW4: No retries or forbidOnly in config

**Severity:** Medium
**File:** `playwright.config.ts`

No `retries` configured — a single transient failure (network hiccup, slow DB) fails the entire run. No `forbidOnly` — a `.only` accidentally committed to main won't be caught in CI.

```ts
// Recommended
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  // ...
});
```

### PW5: Monolithic token management test

**Severity:** Low
**File:** `tests/e2e/token-management.spec.ts:6` (98 lines)

Single test covers create → clipboard copy → revoke → create another → renew → delete. If revoke fails, renew and delete are never tested. Split into focused tests: "create and copy token", "revoke token", "renew token", "delete token". Each would be independently debuggable.

### PW6: Monolithic notification admin test

**Severity:** Low
**File:** `tests/e2e/notifications/admin-notifications.spec.ts:14` (114 lines)

Tests settings toggle AND log filtering AND multi-filter combinations in one test. Split into: "toggle notification type", "filter by event type", "filter by status".

### PW7: Browser dialog handlers are fragile

**Severity:** Low
**File:** `tests/e2e/token-management.spec.ts:46,73,87`

`page.once("dialog", (dialog) => dialog.accept())` handles `window.confirm()`. If UI changes to use a modal component instead, the dialog never fires and the test hangs waiting for a response that completed before the handler registered. Consider migrating to component-based confirmation dialogs (also flagged in F4).

### PW8: Positional selectors for comboboxes

**Severity:** Low
**File:** `tests/e2e/notifications/admin-notifications.spec.ts:98,103`

```ts
await notificationLogSection.getByRole("combobox").nth(0).click();
await notificationLogSection.getByRole("combobox").nth(1).click();
```

Positional `.nth()` breaks if combobox order changes or a new combobox is added. Use accessible name: `getByRole("combobox", { name: "Event type" })` and `getByRole("combobox", { name: "Status" })`.

### PW9: CSS class selector for token value

**Severity:** Low
**File:** `tests/e2e/token-management.spec.ts:37`

```ts
const tokenValue = await tokenDialog.locator("div.font-mono").innerText();
```

`div.font-mono` is a styling class, not semantic. If the class is renamed or moved, the test breaks. Use `getByTestId("token-value")` or a more stable locator.

### PW10: `page.reload()` instead of waiting for UI update

**Severity:** Low
**File:** `tests/e2e/users/user-management.spec.ts:59`

After creating a user, the test calls `page.reload()` before checking the user row. This indicates the UI doesn't update after a successful create. Better: wait for the new row to appear (which also tests that the UI refreshes properly).

```ts
// Current
await adminPage.reload();
const userRow = adminPage.locator("tr", { hasText: createdUser.email });

// Recommended — wait without reload
const userRow = adminPage.locator("tr", { hasText: createdUser.email });
await expect(userRow).toBeVisible({ timeout: 10000 });
```

### PW11: admin-jobs-dashboard mutates initial admin

**Severity:** Low
**File:** `tests/e2e/background-jobs/admin-jobs-dashboard.spec.ts:6-18`

Uses `admin@example.com` (the INITIAL_ADMIN from global seed) and changes their password inside the test. This couples the test to global setup state and would break if another test already changed the password. Should seed a dedicated admin like other tests do.

### PW12: No screenshot-on-failure config

**Severity:** Low
**File:** `playwright.config.ts`

Traces are retained on failure (good), but no `screenshot: "only-on-failure"` configured. Screenshots provide immediate visual context for failures without needing to open the full trace viewer.

```ts
use: {
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
},
```

### PW13: Fixed email addresses would collide in parallel mode

**Severity:** Low
**Files:** `local-login.spec.ts`, `logout.spec.ts`, `theme-persistence.spec.ts`, `rbac-enforcement.spec.ts`, `api-docs.spec.ts`, `token-management.spec.ts`

These tests use fixed emails (`e2e-theme-user@example.com`, `e2e-marketer@example.com`, etc.) instead of unique suffixes. Currently safe with `workers: 1`, but would collide if parallelism is enabled. Tests like `sso-login.spec.ts` and `account-linking.spec.ts` correctly use `Date.now()` suffixes.

---

## Playwright E2E: What's Done Well

- **Locator strategy**: Heavy use of `getByRole`, `getByLabel`, `getByPlaceholder` — follows Playwright's recommended priority
- **Web-first assertions**: Consistent use of `expect(element).toBeVisible()`, `.toHaveURL()`, `.toContainText()` with auto-retry
- **Response-gated actions**: `Promise.all([waitForResponse, click])` pattern prevents race conditions on mutations
- **DB worker isolation**: Clever `execFileSync` + separate process pattern avoids Playwright trying to bundle Prisma
- **Well-typed helpers**: `seedLocalUser`, `seedSsoUser`, etc. have full TypeScript types
- **Unique test data**: Most tests generate unique emails with `Date.now()` + random suffixes
- **Global setup/teardown**: Clean DB provisioning (wipe + re-provision) per run
- **Trace on failure**: `trace: "retain-on-failure"` configured for debugging
- **Multi-context tests**: `account-linking.spec.ts` and `user-management.spec.ts` correctly use `browser.newContext()` with proper cleanup in `finally` blocks
- **Base path handling**: `appBasePath` from env ensures tests work with reverse-proxy base paths
- **Helper abstraction**: Common flows (`loginWithPassword`, `expectOnDashboard`, `loginWithSso`) extracted to helpers — DRY without over-abstracting

## Frontend Design

### FD1: System font stack — no typographic identity

**Severity:** Medium
**File:** `src/app/globals.css:62`

```css
font-family:
  system-ui,
  -apple-system,
  "Segoe UI",
  Roboto,
  sans-serif;
```

Generic system font stack. Every app using system-ui looks identical on the same OS. Per frontend design guidelines: "Avoid generic fonts like Arial, Inter, Roboto, system fonts." Choose a distinctive body font and pair with a display font for headings. Even one custom font (via `next/font`) would differentiate the entire UI.

Suggestion: Pick a body font with character (e.g., DM Sans, General Sans, Satoshi, Plus Jakarta Sans) and optionally a display font for headings (e.g., Cabinet Grotesk, Clash Display, Outfit).

### FD2: Blue-on-white color scheme lacks personality

**Severity:** Medium
**Files:** `src/app/globals.css:9` (`--accent: #2563eb`)

Accent color is Tailwind's `blue-600` — the most common default in SaaS apps. Light theme is white panel on gray background. Dark theme is slate-blue. Functional but completely generic. Per guidelines: "Dominant colors with sharp accents outperform timid, evenly-distributed palettes."

Options:

1. Shift hue to something less ubiquitous (teal, amber, emerald, rose)
2. Add a secondary accent for visual interest
3. Use a more distinctive background tone (warm gray, cool cream, subtle tint)

### FD3: Zero motion or transitions anywhere

**Severity:** Medium
**Files:** entire UI

No CSS transitions, no animations, no micro-interactions. Toast appears/disappears instantly. Nav links have no hover transitions. Theme toggle has no transition. Page loads have no entrance animation. Dashboard cards have no staggered reveal.

Per guidelines: "One well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions."

Minimum viable motion:

```css
/* Global transition for interactive elements */
a,
button,
[role="button"] {
  transition: all 0.15s ease;
}

/* Toast entrance */
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### FD4: Navigation pills have no active state indicator

**Severity:** Low
**File:** `src/components/ui/Navigation.tsx:28`

All nav links look identical — no visual distinction for the current page. Users cannot tell where they are. Add an active state (solid background, underline, or border accent) by comparing `link.href` against the current pathname.

```tsx
// Recommended — highlight active link
const pathname = usePathname();
<Link
  className={cn(
    "rounded-full border px-3 py-1.5 ...",
    pathname === link.href
      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
      : "border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/10"
  )}
  href={link.href}
>
```

### FD5: Toast has no entrance/exit animation

**Severity:** Low
**File:** `src/components/ui/Toast.tsx:30-34`

Toast items appear and disappear instantly (no fade, slide, or scale). Feels jarring. Add CSS animation for entrance and a fade-out before removal.

### FD6: Dashboard cards are uniform boxes — no visual hierarchy

**Severity:** Low
**File:** `src/app/(dashboard)/dashboard/page.tsx:20-37`

Four identical `article` cards with same size, same border, same padding. No visual hierarchy — user's eye has no entry point. Consider:

- Making one card larger/featured (e.g., role or status as a hero card)
- Adding subtle accent color to one card
- Using icons or illustrations to differentiate

### FD7: Login page has no background treatment

**Severity:** Low
**File:** `src/components/auth/AuthPageShell.tsx`

Login card floats on plain `var(--background)`. No gradient, pattern, texture, or visual interest. The auth page is the first thing users see — it sets the tone. Even a subtle gradient mesh, geometric pattern, or grain overlay would add character.

### FD8: Header shadow is the only depth cue in the entire app

**Severity:** Info
**Files:** dashboard layout, AuthPageShell

The sticky header has `shadow-[0_18px_45px_...]` and the auth card has `shadow-[0_30px_80px_...]`. Everything else is flat with only border separation. The shadow quality is good (soft, natural), but it's the only spatial device used. Consider occasionally using layering, overlap, or z-depth to create visual interest in other areas.

### FD9: No hover states on dashboard cards

**Severity:** Low
**File:** `src/app/(dashboard)/dashboard/page.tsx:21-36`

Cards have no hover effect. If they're interactive (clickable to navigate), they need a hover state (lift, border change, background shift). If they're static display, a subtle hover effect still adds polish.

```tsx
// Recommended — add hover transition
<article className="... transition-shadow hover:shadow-lg hover:border-[var(--accent)]/30">
```

### FD10: Divider line in login form uses opacity hack

**Severity:** Info
**File:** `src/components/auth/LoginForm.tsx:86-90`

```tsx
<div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] opacity-35">
  <span className="h-px flex-1 bg-current" />
```

Works functionally, but `opacity-35` on the entire container dims the text and lines together. Using explicit border/text colors instead of opacity gives more control and avoids accessibility issues with low-contrast text.

---

## Frontend Design: What's Done Well

- **Rounded design language**: Consistent `rounded-2xl` / `rounded-full` throughout — gives the app a soft, modern feel
- **Sticky header with quality shadow**: `shadow-[0_18px_45px_...]` is natural and well-tuned, not the typical `shadow-md` default
- **Responsive layout**: Mobile-first with sensible breakpoints, card-based layout adapts well
- **CSS variable theming**: Clean variable system enables dark mode without class duplication
- **Version badge**: `AppVersionBadge` with backdrop-blur is a nice detail
- **Auth shell composition**: `AuthPageShell` + `LoginForm` separation is clean, reusable for other auth pages
- **Uppercase tracking**: Consistent use of `tracking-[0.2em] uppercase` for labels creates a design system feel
- **Divider treatment**: "Local Account" divider in login form is well-executed
- **Color-mix hover states**: Button secondary variant uses `color-mix(in_srgb, ...)` — modern CSS, precise control
- **`border-black/10` pattern**: Subtle borders with opacity throughout give cohesive depth without heaviness

## Prisma: What's Done Well

- **Indexing strategy**: Composite indexes match actual query patterns (job polling, audit lookups, token status checks)
- **Cascade design**: Thoughtful `onDelete` choices — Cascade for owned data, Restrict for audit integrity, SetNull for optional references
- **Enum usage**: All status/type fields use Prisma enums, no magic strings
- **cuid() IDs**: URL-safe, sortable, no sequential enumeration risk
- **Dual-database support**: Clean separation of SQLite (local dev) and PostgreSQL (production)
- **Transaction usage**: Notification creation and password changes correctly use `$transaction`
- **No raw SQL in app code**: Single `$queryRaw` for health check only; all queries use typed client
- **Select scoping in services**: Service layer (`user-admin.ts`, `admin.ts`) maps query results to safe subsets before returning
- **Seed script guards**: Production password placeholder check, password complexity validation, idempotent seeding

## Docker: What's Done Well

- **Multi-stage build**: 5 clean stages (base, deps, builder, prod-deps, runner) with proper separation
- **Prod dependency isolation**: Separate `prod-deps` stage with `--omit=dev`
- **Non-root app user**: Correct UID/GID setup with writable paths pre-created
- **Postgres healthcheck**: Proper `pg_isready` with reasonable intervals
- **Service dependency ordering**: `service_healthy` and `service_completed_successfully` used correctly
- **Production guards**: DATABASE_URL and POSTGRES_PASSWORD validated before startup
- **YAML anchors**: DRY image config with `x-app-image` and `x-migrate-image`
- **Named volumes**: Persistent storage for postgres and uploads
- **Migrate service**: Separate migration runner with `restart: "no"` — runs once then stops
- **.dockerignore covers basics**: node_modules, .git, .next, .env\*, coverage excluded

---

## What's Done Well

- **i18n**: All user-visible text uses next-intl translation keys, no hardcoded strings in components
- **Dark mode**: Comprehensive CSS variable theming with both light and dark variants
- **Semantic HTML**: Proper use of `<nav>`, `<main>`, `<article>`, `<section>`, `<table>`, `<form>`
- **Form labels**: LoginForm has proper `htmlFor` + `id` associations, correct `autoComplete` values
- **Empty states**: All list/table views handle empty data gracefully
- **Mobile responsive**: Mobile-first design with card-based layouts for small screens
- **RSC patterns**: Proper async server components, data fetched at the page level
- **Auth enforcement**: Every API route explicitly checks auth — no accidental public endpoints
- **Date formatting**: Most components use `Intl.DateTimeFormat` (not hardcoded formats)
- **Error handling**: Login form shows inline errors, toast notifications for async operations
- **Controlled inputs**: Password and email inputs properly use controlled state with onChange
- **Link usage**: Navigation uses Next.js `<Link>`, SSO button uses `<a>` — correct semantic choices
- **Prisma usage**: Clean ORM usage, no raw SQL, proper select/include scoping (except N7)
- **Token security**: Tokens hashed with SHA-256, proper entropy, timing-safe validation
- **Parallel fetching**: Admin pages use `Promise.all` for independent queries (admin tokens, notifications)
- **Button focus ring**: shadcn base provides `focus-visible:ring-[3px]` — wrapper preserves it correctly
- **SelectTrigger aria-labels**: CreateUserDialog and UserManagementTable SelectTriggers have `aria-label`
- **useTransition**: LocaleSwitcher and ThemeToggle correctly use `useTransition` for non-blocking updates
- **Production guards**: BetterAuth secret, mock SSO, initial admin password, Postgres password all guarded
- **Functional setState**: Components consistently use functional form `setCurrent((prev) => ...)` for derived state updates

---

## W3 Verification Detail

Confirmed in `src/i18n/messages/en.json` — all loading/saving strings use `...` (three ASCII dots):

```
"loading": "Loading..."
"saving": "Saving..."
"signingIn": "Signing in..."
"creating": "Creating..."
"loading": "Refreshing tokens..."
"loading": "Refreshing notifications..."
"redirecting": "Returning to your CLI callback now..."
```

All should use `…` (U+2026). Check all 5 locale files.
