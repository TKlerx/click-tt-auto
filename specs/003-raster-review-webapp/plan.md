# Implementation Plan: Raster Generation & Review Webapp

**Branch**: `003-raster-review-webapp` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/003-raster-review-webapp/spec.md`

> **Updated 2026-07-12** to absorb Clarifications Session 2026-07-12: canonical Club identity + fuzzy alias mapping (FR-008f), explicit live/manual click-TT ingestion (FR-008e-1), 30-min admin-overridable run limit (FR-010a), German-only UI on next-intl, and indefinite snapshot retention with a latest-delete guard (FR-014a). See `research.md`, `data-model.md`, and `contracts/api.md` for the design deltas.

## Summary

Build the Raster Generation & Review feature inside the existing `webapp/` baseline (a fully scaffolded Next.js 16 + React 19 + Prisma 7 + better-auth application copied from `../webapp-template`). Users upload raw district inputs (club wishes, hall capacities, fixed upper-league Rasterzahlen), the app generates a Rasterzahl assignment by running the **existing** optimizer as an asynchronous background job, and users review hall-capacity conflicts, assignments, objective breakdown, and capacity data. The core pipeline already exists at repo root under `src/raster/` (ingest, optimize, report, score, rulebook) plus a Python CP-SAT exact solver (`scripts/solve-raster-cpsat.py`); this feature wraps that pipeline behind webapp data models, API routes, dashboard pages, and the baseline's background-job/worker system. Importing a pre-computed external snapshot is a later, optional path that reuses the same review layer.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) for the webapp and `src/raster` pipeline; Python 3.12 for the existing CP-SAT solver (invoked as a subprocess via `uv`)
**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7 (`@prisma/client`), better-auth, next-intl, zod, Tailwind 4 / shadcn; `pdfjs-dist` (wishes PDF text extraction, already used by `src/raster/ingest/pdf-text.ts`); OR-Tools CP-SAT via the existing Python script
**Storage**: Prisma — PostgreSQL via the single `schema.postgres.prisma` present in the repo (the originally-planned SQLite dev `schema.prisma` split was not implemented); uploaded files on disk/object storage referenced by rows
**Testing**: Vitest (webapp unit + `src/raster` unit), Playwright (webapp e2e — config already present)
**Target Platform**: Containerized web (Dockerfile.app + Dockerfile.worker already present); desktop/tablet browsers primary
**Project Type**: Web application (Next.js app + background worker) on top of an existing pipeline library
**Performance Goals**: District-scoped views render hundreds of rows without virtualization; SC-004 top-10 clubs < 30s, SC-007 find assignment < 15s, SC-008 find capacity < 15s
**Constraints**: Generated assignments MUST NOT violate fixed upper-league Rasterzahlen (hard constraint, SC-003) or same-club derbies after Spieltag 4; same-club derby Spieltag 4 is legal only as a high-penalty objective component shown in the snapshot breakdown; optimizer runs async so review is never blocked (FR-010) with a 30-min default run limit, admin-overridable (FR-010a); no server-side LLM (FR-002 deterministic parse; LLM prompt/paste is user-side fallback); read-only toward click-TT — live fetch only on explicit refresh, manual upload fallback (FR-008e-1); club names resolved to a canonical per-scope Club via exact-then-fuzzy alias mapping (FR-008f); German-only UI on next-intl
**Scale/Scope**: Hundreds of assignments/conflicts per district snapshot now; data model must not preclude county-wide (~1,400 clubs/teams) with district-scoped views (FR-025)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.0.0 (`.specify/memory/constitution.md`, ratified 2026-07-10).

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Focused click-TT Administration Suite | ✅ PASS (resolved by v3.0.0) | Constitution amended to v3.0.0 (2026-07-10): added the Rasterzahl Review Webapp as a third capability and permitted the web stack scoped to `webapp/`. The earlier "NOT a webapp" prohibition is removed. |
| II. Safety-First Automation | ✅ PASS | App is read-only toward click-TT; it produces proposals a human reviews (FR-023), never auto-writing to click-TT. Uncertain PDF parses are flagged `confidence: "review"` (existing behavior). |
| III. Credential Security | ✅ PASS | Secrets via `.env`; auth via better-auth baseline. No hardcoded credentials. |
| IV. Idempotent & Resumable | ✅ PASS (reframed) | Runs are discrete, tracked jobs with explicit outcomes (FR-011); re-running does not corrupt prior snapshots; capacity/input edits mark dependent snapshots stale (FR-022) rather than mutating them. |
| V. Observable Output | ✅ PASS | Run outcome + objective + solver status per snapshot (FR-012); audit trail of uploads/runs/edits (FR-030); clear empty/error states (FR-024). |
| VI. Quality Gates | ⚠️ PASS w/ amendment | TS strict, ESLint, Prettier, `validate.ps1` all present in `webapp/` and root. Principle VI's literal "No production dependencies beyond Playwright" is already superseded by the v2.0.0 Tech-Stack clause allowing justified deps; the v3.0.0 amendment must explicitly cover the web stack. |

**Gate result**: PASSES. The Principle I conflict was resolved by the v3.0.0 constitution amendment (2026-07-10). All principles pass.

## Project Structure

### Documentation (this feature)

```text
specs/003-raster-review-webapp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API + solver job contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/raster/                     # EXISTING pipeline library (reused as-is, minor exports added)
├── ingest/                     # wishes-pdf, groups-pdf, clicktt-assignments, assignment-table, pdf-text, model
├── optimize/                   # heuristic optimizer (components, search)
├── report/                     # conflict/assignment report building
├── rulebook/                   # cross-size, spielwochen, templates
├── score/                      # penalties, evaluate, derive
└── types.ts

scripts/
└── solve-raster-cpsat.py       # EXISTING Python CP-SAT exact solver (invoked by the worker)

webapp/                         # EXISTING Next.js baseline — feature work lands here
├── prisma/
│   └── schema.prisma           # ADD raster models (InputSet, Wish, HallCapacity, FixedRasterzahl,
│                               #   OptimizationRun, Snapshot, Assignment, Conflict, ReviewDecision)
├── src/
│   ├── app/(dashboard)/raster/ # ADD dashboard pages: inputs, runs, snapshots, conflicts, assignments, capacity
│   ├── app/api/raster/         # ADD API routes: inputs, wishes-extract, runs, snapshots, capacity, decisions, import
│   ├── services/raster/        # ADD service layer: input ingestion, run orchestration, snapshot/read models
│   ├── components/raster/      # ADD UI: conflict overview/detail, assignment table, capacity search/edit
│   └── lib/raster/             # ADD glue to root src/raster pipeline + zod schemas (wishes JSON schema)
├── worker/                     # EXISTING background worker — ADD raster-run job handler (spawns CP-SAT)
└── tests/                      # ADD unit (services, parsers) + e2e (Playwright role/flow tests)
```

**Structure Decision**: Web application layered on the existing baseline. The **generation core is not rebuilt** — `src/raster/*` (TypeScript) and `scripts/solve-raster-cpsat.py` (Python CP-SAT) are reused. The webapp adds persistence (Prisma), an API, dashboard UI, and a background-job handler that runs the optimizer. Roles/users/audit/background-jobs come from the webapp-template baseline. The pnpm workspace already ties root and `webapp/` together.

## Complexity Tracking

> Retained for the record. The Principle I / web-stack tension was **resolved** by the v3.0.0 constitution amendment (ratified 2026-07-10); the justifications below explain why the amendment was warranted.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Webapp + UI framework (Next.js/React) vs Principle I "NOT a webapp / No UI frameworks" | The feature's entire value is a multi-user, role-gated review UI over the Rasterzahl pipeline (conflict overview, assignment tables, capacity editing, run management). A terminal tool cannot serve multiple non-technical schedulers/viewers concurrently. The baseline already scaffolds this stack. | A CLI or static-report approach was rejected: it cannot provide role-based access (FR-025–029), interactive search/filter over hundreds of rows (SC-004/007/008), capacity editing with staleness (FR-022), or async run management (FR-010) for multiple users. |
| Web-scoped production dependencies (Prisma, better-auth, next-intl, Tailwind, zod) | Required by the Next.js baseline for persistence, auth/roles, i18n, and validation. | Hand-rolling auth/ORM/validation would be more code and less safe than the vetted baseline; contradicts "narrowly-scoped, justified" allowance already in v2.0.0. |
| Python (CP-SAT) alongside TypeScript | The exact optimizer already exists in Python (OR-Tools); it yields proven-optimal vs feasible outcomes (FR-011/013). | Porting CP-SAT to TS was rejected — high risk, redundant, and OR-Tools has no equivalent TS solver. The worker invokes it as a subprocess. |

**Governance action (completed)**: The constitution was amended to v3.0.0 (2026-07-10) — adding the Rasterzahl Review Webapp capability and scoping the web stack to `webapp/` — mirroring the v2.0.0 amendment that admitted the offline planner. No further governance action is required before implementation.
</content>
