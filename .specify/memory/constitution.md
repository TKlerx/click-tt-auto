# click-TT Automation Constitution

## Core Principles

### I. Single-Purpose CLI Tool
This project is a Playwright-based CLI automation tool for approving table tennis match reports in click-TT (WTTV). It is NOT a webapp — it is a headless/headed browser automation script run from the command line. Keep dependencies minimal. No frameworks beyond Playwright + TypeScript.

### II. Safety-First Automation
The tool automates approval of match reports in a live system with real consequences. Every approval action must be validated against explicit rules before execution. When in doubt, skip the match and report it for manual review. Never approve a match that fails any validation check. Log every action taken and every skip with clear reasons.

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
- **Quality**: ESLint, Prettier, TypeScript strict, validate.ps1

## Development Workflow

- All changes go through `validate.ps1` before commit
- Spec Kit workflow: specify → plan → implement
- Feature branches for new capabilities
- CONTINUE.md tracks current state

## Governance

Constitution supersedes all other practices. Amendments require documentation and rationale. Safety-first principle is non-negotiable — never trade safety for convenience.

**Version**: 1.0.0 | **Ratified**: 2026-04-10 | **Last Amended**: 2026-04-10
