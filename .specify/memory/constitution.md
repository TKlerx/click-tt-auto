# click-TT Automation Constitution

## Core Principles

### I. Focused click-TT Administration Suite
This project is a TypeScript suite for click-TT (WTTV) league administration. Its capabilities are:
1. **Match approval** — Playwright browser automation that reviews and approves match reports (CLI).
2. **Rasterzahl planning** — an offline planner that ingests season inputs, scores Rasterzahl assignments for hall over-usage and unfulfilled wishes, and optimizes them (CLI, reused as a library).
3. **Rasterzahl Review Webapp** — a multi-user web application (in `webapp/`) that ingests raw district inputs, generates a Rasterzahl assignment by running the planning optimizer as an asynchronous job, and lets role-gated users review hall-capacity conflicts, assignments, and capacity data.

Capabilities 1–2 are terminal commands sharing config, reporting, and (where useful) the click-TT navigation layer. Capability 3 is a web application built on the vetted `webapp-template` baseline and MUST reuse the planning pipeline rather than reimplementing it. Keep dependencies minimal and purposeful: Playwright + TypeScript is the CLI baseline; any additional dependency must be narrowly scoped and justified in the feature's plan (e.g. a pure-JS PDF reader for the planner). The web stack (Next.js/React/Prisma/auth) is permitted **only within `webapp/`** and MUST NOT leak into the CLI capabilities.

### II. Safety-First Automation
Actions against the live click-TT system have real consequences. Every write action (e.g. approval) must be validated against explicit rules before execution; when in doubt, skip and report for manual review. Offline and webapp capabilities (e.g. Rasterzahl planning and the Review Webapp) must be read-only toward click-TT and produce proposals the human reviews, never writing back automatically. Where parsing is uncertain, flag for manual review rather than guessing. Log every action and every skip with clear reasons.

### III. Credential Security
Credentials (username/password) must never be hardcoded or committed to the repository. Use environment variables or a `.env` file (git-ignored). The `.env.example` file documents required variables without values.

### IV. Idempotent & Resumable
The tool must handle interruptions gracefully. If it crashes mid-run, re-running should not cause double-approvals (already-approved matches won't appear in the filtered list). The tool should work page-by-page through the match list.

### V. Observable Output
Every run must produce a clear summary: how many matches were processed, how many approved, how many skipped (with reasons per match). This output goes to stdout and optionally to a JSON report file.

### VI. Quality Gates
- TypeScript strict mode
- ESLint for code quality
- Prettier for formatting
- `validate.ps1` script runs typecheck + lint before commit
- CLI capabilities keep production dependencies minimal (Playwright baseline + narrowly-justified additions); the `webapp/` stack is governed by the Technology Stack section above

## Technology Stack

- **Runtime**: Node.js (LTS)
- **Language**: TypeScript (strict mode)
- **Browser Automation**: Playwright
- **CLI Arguments**: Simple arg parsing (minimist or built-in)
- **Config**: `.env` file for credentials, CLI args for options
- **Additional dependencies**: permitted when narrowly scoped and justified in a feature plan (e.g. a pure-JS PDF reader, Excel I/O). Avoid native binaries and heavyweight frameworks in the CLI capabilities.
- **Webapp stack** (scoped to `webapp/`): Next.js + React, Prisma (SQLite dev / PostgreSQL prod), better-auth, next-intl, zod, Tailwind/shadcn, and a background worker. The webapp MAY invoke the existing Python CP-SAT solver (OR-Tools via `uv`) as a subprocess job. This stack is confined to `webapp/` and does not relax the minimal-dependency rule for the CLI capabilities.
- **Quality**: ESLint, Prettier, TypeScript strict, validate.ps1

## Development Workflow

- All changes go through `validate.ps1` before commit
- Spec Kit workflow: specify → plan → implement
- Feature branches for new capabilities
- CONTINUE.md tracks current state

## Governance

Constitution supersedes all other practices. Amendments require documentation and rationale. Safety-first principle is non-negotiable — never trade safety for convenience.

**Version**: 3.0.0 | **Ratified**: 2026-04-10 | **Last Amended**: 2026-07-10

*Amendment 3.0.0 (2026-07-10)*: Added a third capability — the Rasterzahl Review Webapp — to Principle I, removing the absolute "NOT a webapp / No UI frameworks" prohibition. Permitted a web stack (Next.js/React/Prisma/auth + background worker) scoped strictly to `webapp/`, and allowed the webapp to invoke the existing Python CP-SAT solver as a subprocess. Extended Principle II's read-only, human-reviewed guarantee to the webapp. Rationale: feature 003 delivers a multi-user review/generation webapp on the vetted webapp-template baseline, reusing the planning pipeline; the CLI capabilities keep their minimal-dependency ethos.

*Amendment 2.0.0 (2026-07-07)*: Reframed Principle I from a single-purpose approval tool to a focused click-TT administration toolkit (approval + Rasterzahl planning); allowed narrowly-scoped, justified dependencies. Extended Principle II to cover offline, read-only capabilities. Rationale: feature 002 (Rasterzahl Wish Optimizer) adds an offline planner and a PDF-reader dependency while preserving the safety-first, minimal-dependency, observable-output ethos.
