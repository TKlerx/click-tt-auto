# click-tt-automation Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-12

## Active Technologies

- TypeScript 5.9 strict for webapp/root raster code; Python 3.12 for the existing CP-SAT subprocess + Existing Next.js 16, React 19, Prisma 7, better-auth, next-intl, zod, Tailwind/shadcn; existing root `src/raster/*`; existing Python OR-Tools CP-SAT script (004-compare-raster-runs)
- Existing Prisma SQLite dev / PostgreSQL prod schema, extended with scenario/manual-assignment fields as needed (004-compare-raster-runs)

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

- 004-compare-raster-runs: Added TypeScript 5.9 strict for webapp/root raster code; Python 3.12 for the existing CP-SAT subprocess + Existing Next.js 16, React 19, Prisma 7, better-auth, next-intl, zod, Tailwind/shadcn; existing root `src/raster/*`; existing Python OR-Tools CP-SAT script

- main: Added TypeScript 5.x, Node.js LTS (22.x) + Playwright (browser automation), dotenv (credentials), minimist (CLI args)

<!-- MANUAL ADDITIONS START -->

## click-TT / nuLiga Admin Scraping

- Do not replay `nuLigaAdminTTDE.woa/wo/...` links collected from an admin page. Those URLs contain stateful click counters and can return the wrong group/PDF when opened later or out of sequence.
- For Rasterzahl ingest, navigate by clicking through the live admin UI. After downloading a group-level `Terminmeldungen (pdf)`, verify the PDF text contains the clicked group page title before trusting it.

<!-- MANUAL ADDITIONS END -->

@RTK.md
