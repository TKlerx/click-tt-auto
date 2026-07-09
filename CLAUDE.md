# click-tt-automation Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-09

## Active Technologies
- TypeScript 5.9 (strict) for the webapp and `src/raster` pipeline; Python 3.12 for the existing CP-SAT solver (invoked as a subprocess via `uv`) + Next.js 16 (App Router), React 19, Prisma 7 (`@prisma/client`), better-auth, next-intl, zod, Tailwind 4 / shadcn; `pdfjs-dist` (wishes PDF text extraction, already used by `src/raster/ingest/pdf-text.ts`); OR-Tools CP-SAT via the existing Python script (003-raster-review-webapp)
- Prisma — SQLite for dev (`schema.prisma`), PostgreSQL for prod (`schema.postgres.prisma`); uploaded files on disk/object storage referenced by rows (003-raster-review-webapp)

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
- 003-raster-review-webapp: Added TypeScript 5.9 (strict) for the webapp and `src/raster` pipeline; Python 3.12 for the existing CP-SAT solver (invoked as a subprocess via `uv`) + Next.js 16 (App Router), React 19, Prisma 7 (`@prisma/client`), better-auth, next-intl, zod, Tailwind 4 / shadcn; `pdfjs-dist` (wishes PDF text extraction, already used by `src/raster/ingest/pdf-text.ts`); OR-Tools CP-SAT via the existing Python script

- main: Added TypeScript 5.x, Node.js LTS (22.x) + Playwright (browser automation), dotenv (credentials), minimist (CLI args)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
