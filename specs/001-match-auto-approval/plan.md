# Implementation Plan: Match Report Auto-Approval

**Branch**: `main` | **Date**: 2026-04-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-match-auto-approval/spec.md`

## Summary

Build a Playwright-based CLI tool in TypeScript that automates the approval of table tennis match reports in the click-TT admin webapp (WTTV). The tool logs in, navigates to the match list, filters for unapproved matches, iterates through all pages, validates each match against the approval rules, approves valid matches, produces a detailed report of all actions taken, and optionally syncs skipped-match and `Nicht angetreten` fine candidates into an existing Excel workbook.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js LTS (22.x)
**Primary Dependencies**: Playwright (browser automation), dotenv (credentials), minimist (CLI args), ExcelJS (fine workbook sync)
**Storage**: JSON report files written to `reports/` directory, optional append-only Excel workbook updates
**Testing**: Vitest for unit tests on validation logic
**Target Platform**: Windows (primary), cross-platform compatible
**Project Type**: CLI tool
**Performance Goals**: Process ~284 matches in under 30 minutes (including page load times)
**Constraints**: Stateful click-TT URLs prevent deep linking; must navigate sequentially; 1.5-2s wait between page loads
**Scale/Scope**: ~284 matches per season, 10 pages, 3 groups (Bezirksoberliga, 1. Bezirksliga 1, 1. Bezirksliga 2)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Single-Purpose CLI Tool | PASS | Pure CLI automation, no webapp framework |
| II. Safety-First Automation | PASS | 4 validation rules, skip on doubt, detailed report |
| III. Credential Security | PASS | `.env` file, git-ignored, `.env.example` for docs |
| IV. Idempotent & Resumable | PASS | Already-approved matches detected by checkmark, skipped matches tracked |
| V. Observable Output | PASS | Stdout summary + JSON report file + optional workbook sync summary |
| VI. Quality Gates | PASS | TypeScript strict, ESLint, Prettier, validate.ps1 |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-match-auto-approval/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (CLI command schema)
```

### Source Code (repository root)

```text
src/
├── index.ts             # CLI entry point — parse args, orchestrate run
├── config.ts            # Load .env, CLI args, configuration
├── auth.ts              # Login to click-TT
├── navigation.ts        # Navigate to match list, handle pagination
├── match-list.ts        # Parse match list page, extract match entries
├── match-detail.ts      # Parse match detail page, extract validation data
├── validator.ts         # Apply 4 validation rules to match data
├── approver.ts          # Check checkbox + save (or dry-run skip)
├── fines.ts             # Derive and sync Excel fine workbook rows
├── reporter.ts          # Generate stdout summary + JSON report
└── types.ts             # Shared types (Match, ValidationResult, Report, etc.)

reports/                 # Generated JSON report files (git-ignored)

tests/
└── unit/
    ├── validator.test.ts    # Test validation logic with mock data
    ├── match-list.test.ts   # Test list parsing logic
    ├── match-detail.test.ts # Test detail page parsing logic
    └── fines.test.ts        # Test fine-candidate derivation and workbook sync
```

**Structure Decision**: Single flat `src/` directory — the tool is simple enough that nested modules are unnecessary. Each file has a clear single responsibility. Validation logic is isolated in `validator.ts` for easy unit testing without browser dependencies, while workbook-specific logic is isolated in `fines.ts` so browser automation and Excel I/O remain separate.

## Complexity Tracking

No constitution violations. No complexity justification needed.
