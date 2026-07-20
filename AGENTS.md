# click-tt-automation Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-19

## Active Technologies
- TypeScript 5.9 (strict), Node.js LTS 22.x — both halves + CLI — Playwright, dotenv, minimist (all present). Webapp — Next.js 16, Prisma 7, zod (all present). **One new dependency is likely**: a zip reader for the webapp's bundle path (FR-019a), justified below. (009-nuliga-team-roster-import)
- PostgreSQL via `webapp/prisma/schema.postgres.prisma`. New roster tables; no existing model changes. (009-nuliga-team-roster-import)
- TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16, React 19, Prisma 7, zod — all present; this feature adds none (008-wish-import-conflicts)
- TypeScript 5.9 (strict) for the webapp and `src/raster` ingest; Python 3.12 for the CP-SAT solver/worker (unchanged by this feature) + Next.js 16 (App Router), Prisma 7 (PostgreSQL), `pdfjs-dist` via existing `src/raster/ingest/pdf-text.ts`; existing raster ingest/season-model pipeline (010-upper-league-raster-import)
- PostgreSQL. Reuses the existing `RasterSource` table (scope + season + `sourceType` + `parsedJson`); no schema migration (`sourceType` is free text) (010-upper-league-raster-import)
- TypeScript 5.9 (strict), Next.js 16 App Router, React 19 + Prisma 7 (PostgreSQL), next-intl, Tailwind 4 / shadcn, better-auth (via 007 access layer) (011-raster-import-ux)
- PostgreSQL. **One migration**: add `inputSetId String?` FK from `RasterSource` to `RasterInputSet` and re-key source uniqueness to the workspace. `RasterInputSet` already has a `name` — it *is* the planning workspace; no new entity. (011-raster-import-ux)

- TypeScript 5.9 strict for webapp/root raster code; Python 3.12 for the existing CP-SAT subprocess + Existing Next.js 16, React 19, Prisma 7, better-auth, next-intl, zod, Tailwind/shadcn; existing root `src/raster/*`; existing Python OR-Tools CP-SAT script (004-compare-raster-runs)
- Existing Prisma SQLite dev / PostgreSQL prod schema, extended with scenario/manual-assignment fields as needed (004-compare-raster-runs)
- TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all already present in `webapp/`; this feature adds none (005-raster-guided-navigation)
- PostgreSQL via `webapp/prisma/schema.postgres.prisma` (single schema; no dev SQLite schema in this repo) (005-raster-guided-navigation)
- TypeScript 5.9 (strict), Node.js LTS 22.x; Python 3.12 for the existing CP-SAT solver, invoked as a subprocess + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all present; this feature adds none (006-combined-wttv-planning)
- TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod — all present; this feature adds none (007-scope-access-management)
- PostgreSQL via `webapp/prisma/schema.postgres.prisma`. **No schema change** — `UserScopeAssignment` already exists with `@@unique([userId, scopeId])` (007-scope-access-management)

- TypeScript 5.x, Node.js LTS (22.x) + Playwright (browser automation), dotenv (credentials), minimist (CLI args) (main)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x, Node.js LTS (22.x): Follow standard conventions

## Recent Changes
- 010-upper-league-raster-import: Added TypeScript 5.9 (strict) for the webapp and `src/raster` ingest; Python 3.12 for the CP-SAT solver/worker (unchanged by this feature) + Next.js 16 (App Router), Prisma 7 (PostgreSQL), `pdfjs-dist` via existing `src/raster/ingest/pdf-text.ts`; existing raster ingest/season-model pipeline
- 011-raster-import-ux: Added TypeScript 5.9 (strict), Next.js 16 App Router, React 19 + Prisma 7 (PostgreSQL), next-intl, Tailwind 4 / shadcn, better-auth (via 007 access layer)
- 009-nuliga-team-roster-import: Added TypeScript 5.9 (strict), Node.js LTS 22.x — both halves + CLI — Playwright, dotenv, minimist (all present). Webapp — Next.js 16, Prisma 7, zod (all present). **One new dependency is likely**: a zip reader for the webapp's bundle path (FR-019a), justified below.
- 008-wish-import-conflicts: Added TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16, React 19, Prisma 7, zod — all present; this feature adds none
- 006-combined-wttv-planning: Added TypeScript 5.9 (strict), Node.js LTS 22.x; Python 3.12 for the existing CP-SAT solver, invoked as a subprocess + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all present; this feature adds none
- 007-scope-access-management: Added TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod — all present; this feature adds none
- 005-raster-guided-navigation: Added TypeScript 5.9 (strict), Node.js LTS 22.x + Next.js 16 (App Router), React 19, Prisma 7, better-auth, next-intl, zod, Tailwind 4 / shadcn — all already present in `webapp/`; this feature adds none
- 004-compare-raster-runs: Added TypeScript 5.9 strict for webapp/root raster code; Python 3.12 for the existing CP-SAT subprocess + Existing Next.js 16, React 19, Prisma 7, better-auth, next-intl, zod, Tailwind/shadcn; existing root `src/raster/*`; existing Python OR-Tools CP-SAT script


<!-- MANUAL ADDITIONS START -->

## click-TT / nuLiga Admin Scraping

- Do not replay `nuLigaAdminTTDE.woa/wo/...` links collected from an admin page. Those URLs contain stateful click counters and can return the wrong group/PDF when opened later or out of sequence.
- For Rasterzahl ingest, navigate by clicking through the live admin UI. After downloading a group-level `Terminmeldungen (pdf)`, verify the PDF text contains the clicked group page title before trusting it.

<!-- MANUAL ADDITIONS END -->

@RTK.md
