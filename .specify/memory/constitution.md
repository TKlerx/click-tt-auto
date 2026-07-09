# click-TT Automation Constitution

## Core Principles

### I. Focused CLI Toolkit
This project is a TypeScript CLI toolkit for click-TT (WTTV) league administration. Its capabilities are:
1. **Match approval** — Playwright browser automation that reviews and approves match reports.
2. **Rasterzahl planning** — an offline planner that ingests season inputs, scores Rasterzahl assignments for hall over-usage and unfulfilled wishes, and optimizes them.

It is NOT a webapp — every capability is a command run from the terminal, sharing config, reporting, and (where useful) the click-TT navigation layer. Keep dependencies minimal: Playwright + TypeScript is the baseline, and any additional dependency must be narrowly scoped and justified in the feature's plan (e.g. a pure-JS PDF reader for the planner). No UI frameworks.

### II. Safety-First Automation
Actions against the live click-TT system have real consequences. Every write action (e.g. approval) must be validated against explicit rules before execution; when in doubt, skip and report for manual review. Offline capabilities (e.g. Rasterzahl planning) must be read-only toward click-TT and produce proposals the human reviews, never writing back automatically. Where parsing is uncertain, flag for manual review rather than guessing. Log every action and every skip with clear reasons.

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
- No production dependencies beyond Playwright

## Technology Stack

- **Runtime**: Node.js (LTS)
- **Language**: TypeScript (strict mode)
- **Browser Automation**: Playwright
- **CLI Arguments**: Simple arg parsing (minimist or built-in)
- **Config**: `.env` file for credentials, CLI args for options
- **Additional dependencies**: permitted when narrowly scoped and justified in a feature plan (e.g. a pure-JS PDF reader, Excel I/O). Avoid native binaries and heavyweight frameworks.
- **Quality**: ESLint, Prettier, TypeScript strict, validate.ps1

## Development Workflow

- All changes go through `validate.ps1` before commit
- Spec Kit workflow: specify → plan → implement
- Feature branches for new capabilities
- CONTINUE.md tracks current state

## Governance

Constitution supersedes all other practices. Amendments require documentation and rationale. Safety-first principle is non-negotiable — never trade safety for convenience.

**Version**: 2.0.0 | **Ratified**: 2026-04-10 | **Last Amended**: 2026-07-07

*Amendment 2.0.0 (2026-07-07)*: Reframed Principle I from a single-purpose approval tool to a focused click-TT administration toolkit (approval + Rasterzahl planning); allowed narrowly-scoped, justified dependencies. Extended Principle II to cover offline, read-only capabilities. Rationale: feature 002 (Rasterzahl Wish Optimizer) adds an offline planner and a PDF-reader dependency while preserving the safety-first, minimal-dependency, observable-output ethos.
