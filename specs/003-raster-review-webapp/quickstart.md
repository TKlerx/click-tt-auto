# Quickstart: Raster Generation & Review Webapp

## Prerequisites

- Node.js ≥ 22, pnpm 11
- Python 3.12 + `uv` (for the CP-SAT solver `scripts/solve-raster-cpsat.py`)
- The existing `webapp/` baseline installs (Next.js 16, Prisma 7, better-auth)

## Setup

```bash
# repo root
pnpm install

# webapp
cd webapp
cp .env.example .env            # set DATABASE_URL (SQLite dev) + auth secrets
pnpm prisma:generate
pnpm prisma:migrate             # after adding raster models
pnpm prisma:seed                # seed an admin user + a demo district
```

## Run (dev)

```bash
# terminal 1 — web
cd webapp && pnpm dev
# terminal 2 — background worker (runs raster-run jobs)
cd webapp && pnpm worker        # or docker compose up worker
```

## Happy-path smoke test (US1)

1. Sign in as **admin**. Create an InputSet for a district.
2. Register source material at the right hierarchy level: WTTV-wide group documents under `WTTV`, district-only wishes under `OWL`, and shared national material under `DE`.
3. Open `/raster?district=OWL` and verify inherited WTTV sources are visible without being copied into OWL.
4. Load group data: click **Refresh** on a `GROUP_ASSIGNMENT` source to trigger the live click-TT fetch/parse; if that fails, upload a click-TT export instead (manual fallback). Reopening the input set reuses the stored cache — no reparse without an explicit refresh/upload.
5. Upload a wishes PDF → verify deterministic parse shows clubs/teams marked *review*; correct any.
   - For any club name that does not exactly match a canonical club, confirm the fuzzy-proposed match (or map/create one); the alias is saved and not re-asked next time.
6. Upload hall-capacity CSV (or add via form); search a club to confirm.
7. Add fixed upper-league Rasterzahlen (manual entry).
8. Validate the InputSet → status `ready`.
9. Start a run → it goes `pending`→`running` asynchronously; the UI stays responsive. (Admins may override the default 30-min time limit on start, FR-010a.)
10. When it finishes, open the snapshot → confirm optimality label (proven-optimal/feasible) and that **no fixed Rasterzahl is violated** (SC-003).
11. Delete a superseded snapshot → no warning. Attempt to delete the newest snapshot for the district+season → the app requires an explicit confirmation first (FR-014a).

## Review checks (US2–US4)

- Conflict overview shows totals + top clubs (< 30s to read top-10, SC-004); drill to a club's weeks/teams in ≤ 3 clicks (SC-005).
- Assignment view: find a specific team via search in < 15s (SC-007); fixed/pinned visually distinct (FR-021).
- Capacity: search a club/hall/weekday in < 15s (SC-008); edit one value → dependent snapshot shows **stale** (FR-022).

## Role checks (US5)

- **scheduler**: can review + edit capacity; **cannot** start runs or upload inputs (403).
- **viewer**: read-only; every mutating action returns 403.

## Validate before commit

```bash
cd webapp && pnpm validate      # typecheck + lint (+ tests)
# root pipeline
cd .. && pnpm test && pnpm typecheck
```
</content>
