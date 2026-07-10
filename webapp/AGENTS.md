# webapp-template Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-11

## Workflow First Step

- Read `CONTINUE.md` before starting implementation work.
- Use `CONTINUE.md` for recent changes, current stopping point, open issues, and next actions.
- Update `CONTINUE.md` and append to `CONTINUE_LOG.md` when project state materially changes.

## Active Technologies

- TypeScript 5.9, Next.js 16 App Router, React 19 + Existing Next.js server components/API routes, Prisma 7, Better Auth role/session helpers, next-intl, lucide-react, existing monitoring and app-version helpers (021-ops-health-dashboard)
- Existing Prisma database only; no new tables planned. Use existing background job records for worker evidence and existing deployment/runtime metadata when available. (021-ops-health-dashboard)

- TypeScript 5.9 on Node.js via the existing `tsx` dev dependency + Node built-ins, existing `tsx`, Azure CLI available in deployment runners (020-deploy-smoke-verification)
- No new storage; smoke evidence remains command output and GitHub step summary (020-deploy-smoke-verification)

- TypeScript 5.9 on Next.js 16 App Router with React 19; Python 3.12 worker; PowerShell/Node validation scripts + Existing `src/lib/logger.ts`, `src/proxy.ts`, `src/instrumentation.ts`, Prisma-backed services, Python stdlib `logging`/`json`, Vitest, Playwright, existing validation scripts (019-logging-standardization)
- No new storage; operational logs remain process output; audit records remain Prisma-backed and separate (019-logging-standardization)

- TypeScript 5.9 on Next.js 16 App Router, React 19, Python 3.12 worker where affected, PowerShell validation scripts + Prisma 7, Better Auth, Zod, Vitest, Playwright, GitHub Actions, GoReleaser, DeepSec 2.0.12 (017-deepsec-remediation)
- SQLite for local development, PostgreSQL for Docker/shared deployments; background job and audit data persisted via Prisma models (017-deepsec-remediation)

- TypeScript 5.9 on Next.js 16 App Router (React 19) + Next.js 16, React 19, Prisma 7, Better Auth, Zod, Vitest, Playwright, jscpd (011-route-refactor)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

pnpm test; pnpm run lint

## Code Style

TypeScript 5.9 on Next.js 16 App Router (React 19): Follow standard conventions

- Repository text files use UTF-8 encoding without BOM and LF (`\n`) line endings

## Recent Changes

- 021-ops-health-dashboard: Added TypeScript 5.9, Next.js 16 App Router, React 19 + Existing Next.js server components/API routes, Prisma 7, Better Auth role/session helpers, next-intl, lucide-react, existing monitoring and app-version helpers

- 020-deploy-smoke-verification: Added TypeScript 5.9 on Node.js via the existing `tsx` dev dependency + Node built-ins, existing `tsx`, Azure CLI available in deployment runners

- 019-logging-standardization: Added TypeScript 5.9 on Next.js 16 App Router with React 19; Python 3.12 worker; PowerShell/Node validation scripts + Existing `src/lib/logger.ts`, `src/proxy.ts`, `src/instrumentation.ts`, Prisma-backed services, Python stdlib `logging`/`json`, Vitest, Playwright, existing validation scripts

<!-- MANUAL ADDITIONS START -->

@AI_TESTING.md

<!-- MANUAL ADDITIONS END -->
