# Implementation Plan: Raster Import UX

**Branch**: `011-raster-import-ux` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-raster-import-ux/spec.md`

## Summary

Rework the Raster import page so scope and season act as page context, input sets are presented as named "planning workspaces" selected once, source actions default to the selected workspace, and the primary add-source flow is at the top rather than hidden at the bottom. The one structural change under the UX: **sources become owned by a workspace**, which today they are not — `RasterSource` is keyed only by scope+season. That needs a migration (`inputSetId` on `RasterSource`) plus lazy adoption of legacy sources. Everything else is page restructuring, a URL-tracked workspace selection, and reuse of feature 007's access levels.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Next.js 16 App Router, React 19
**Primary Dependencies**: Prisma 7 (PostgreSQL), next-intl, Tailwind 4 / shadcn, better-auth (via 007 access layer)
**Storage**: PostgreSQL. **One migration**: add `inputSetId String?` FK from `RasterSource` to `RasterInputSet` and re-key source uniqueness to the workspace. `RasterInputSet` already has a `name` — it *is* the planning workspace; no new entity.
**Testing**: Vitest (unit/integration), Playwright (the import flow), existing raster route/service test patterns
**Target Platform**: Linux server (Next.js webapp)
**Project Type**: Web application (Next.js) — a UI + data-ownership feature, no `src/raster` pipeline change
**Performance Goals**: N/A beyond page responsiveness; success criteria are task-time/comprehension (add a URL in <60s, identify the active workspace in <10s)
**Constraints**: No source left unowned (FR-009b); write actions gated at the API by 007 scheduler access (FR-016); selection survives refresh via the URL (FR-008a)
**Scale/Scope**: One scope+season page at a time; typically one active workspace; a handful of sources per workspace

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Simplicity First** — PASS. The "planning workspace" is the existing `RasterInputSet` (already named), not a new entity. Reuses the source service, the import page, and 007's access layer. The only genuinely new artifacts are one migration and a workspace selector.
- **II. Test Coverage** — PASS (with obligations). Tasks MUST cover: source→workspace ownership + default, legacy adoption (FR-009b), auto-select/selector/reset (FR-007/007a/008), API-level role enforcement (FR-016), and the save-then-parse flow. Playwright for the primary journey.
- **III. Duplication Control** — PASS. Restructures the existing page rather than adding a parallel one; source ownership replaces the implicit scope+season sharing, not duplicates it.
- **IV. Incremental Delivery** — PASS. US1/US2 (P1) are the MVP; US3 (P2) and US4 (P3) layer on. Each is independently testable.
- **VIII. Web App Standards / IX. i18n / X. Responsive** — APPLIES strongly (this is a UI feature): base-path-correct routes, toast feedback, translation keys for en/de/es/fr/pt on every new string, responsive layout verified. Tasks MUST include these, not defer them.
- **VII. Azure OpenAI** — N/A.
- **Technology Constraints** — PASS. Existing stack; one Prisma migration in `prisma/migrations-postgres/` (PostgreSQL only, per constitution 2.0.0). No new dependency.

No violations. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-raster-import-ux/
├── plan.md · research.md · data-model.md · quickstart.md · contracts/ · tasks.md
```

### Source Code (repository root)

```text
webapp/prisma/
├── schema.postgres.prisma                       # add RasterSource.inputSetId FK + re-key uniqueness
└── migrations-postgres/<ts>_source_workspace/   # the migration

webapp/src/
├── app/(dashboard)/raster/import/page.tsx        # restructure: context header, workspace selector,
│                                                 #   top add-source area, save→parse states
├── components/raster/…                           # workspace selector, add-source panel, source cards
├── services/raster/inputSets.ts                  # create/list workspaces (input sets) by scope+season
├── services/raster/sources.ts                    # scope by inputSetId; adopt legacy null-owner sources
├── app/api/raster/sources/…                      # write endpoints gate on 007 scheduler access
└── i18n/messages/{en,de,es,fr,pt}.json           # new UI strings

webapp/tests/
├── integration/raster-source-workspace.test.ts   # ownership, default, legacy adoption, role enforcement
├── unit/…                                          # workspace auto-select / reset logic
└── e2e/raster-import-ux.spec.ts                    # the primary journey (US1–US3)
```

**Structure Decision**: Web application, entirely within `webapp` plus one migration. No shared `src/raster` change (this is UX + ownership, not ingest). The workspace is the existing `RasterInputSet`; sources gain an owner.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
