# Quickstart: Scope Access Management

**Feature**: `007-scope-access-management` | **Date**: 2026-07-15

---

## What this feature actually is

Smaller than "permissions" suggests. `UserScopeAssignment`, the three roles, platform admins seeing everything, scoped filtering, and the last-admin guard **all already exist**.

Two things do not:

1. **Any way to create or remove an assignment.** The users API has approve, deactivate, reactivate, role, theme — and nothing for scopes. Granting someone a Bezirk today means editing the database.
2. **Any way for a non-platform-admin to act.** `access.ts` declares `scheduler: [PLATFORM_ADMIN, SCOPE_ADMIN]`, and the Raster page ignores it, checking `PLATFORM_ADMIN` in seven places. So `SCOPE_ADMIN` is indistinguishable from `SCOPE_USER` in Raster.

Much of the work is **subtraction**: delete an ancestor walk, delete seven hardcoded checks.

---

## Orientation

| What | Why |
|---|---|
| `webapp/src/lib/rbac.ts` | `checkScopeAccess` — already exact-match, already correct. One caller |
| `webapp/src/lib/raster/access.ts` | `levelRoles` (the intent) and the ancestor walk (the bug) |
| `webapp/src/app/(dashboard)/raster/page.tsx` | The seven hardcoded `PLATFORM_ADMIN` checks. Feature 005 moves them; this fixes them |
| `webapp/src/services/api/user-admin.ts` | The pattern to copy: `requireRouteUserWithRoles`, `withSerializableRetry`, `safeLogAudit`. Also holds `ensureAdminUserCanChange` — **FR-012a is already built** |
| `webapp/src/app/(dashboard)/users/page.tsx:12` | The single gate that must become many |

---

## Build order

Follows the spec's priorities. The order within Stage 3 is not negotiable.

### Stage 1 — User Story 1: grant and revoke (P1)

1. `services/api/scope-assignments.ts` — grant, revoke, list. Copy `user-admin.ts`'s shape.
2. `/api/users/[id]/scopes` — POST, DELETE, GET.
3. Assignment UI for platform admins.
4. Remove the ancestor walk from `access.ts` (FR-011). `rbac.ts` is already right.

**Verify**: grant a scoped user one Bezirk; they reach it and nothing else. Assign the Verband; they reach Verband-level data and no Bezirk below it.

### Stage 2 — User Story 2: work in your scope (P2)

1. Raster API routes: `"admin"` → `"scheduler"` for the work.
2. The seven page checks → level-based.

**Verify**: a scope admin holding OWL imports a source and starts a run there; the same attempt in a Bezirk they do not hold fails **at the API**, tested directly rather than through the UI.

### Stage 3 — User Story 3: delegated administration (P3)

**Order matters. Do not reorder.**

1. The authorisation helper (may A grant S to U?) — FR-021, FR-022, FR-023.
2. Wire it into the endpoints. Enforcement lives here.
3. Exact-email lookup (FR-026, FR-027).
4. Actor-dependent data load on the users page.
5. **Only now** widen the page gate to `SCOPE_ADMIN`.

Widening the gate before the per-action checks — even for one commit — is a privilege escalation, because the page currently loads every user.

**Verify**: a scope admin grants their own Bezirk; attempts one they do not hold and is refused by the API; cannot grant themselves; cannot grant platform admin; cannot list users.

### Stage 4 — User Story 4: see who has access (P4)

Per-scope and per-user views, filtered to what the actor may see.

---

## Verification against success criteria

| SC | How |
|---|---|
| SC-001 | Grant a Bezirk in under 30 seconds, no database |
| SC-002 | A user with one Bezirk reaches it and nothing else, checked in every place that checks access |
| SC-003 | A Verband assignment reaches Verband data and no Bezirk below |
| SC-004 | The same user and scope resolve identically everywhere — no path grants more than another |
| SC-005 | A scope admin cannot reach a scope they do not hold, **via the API directly**, not just the UI |
| SC-006 | Every access change is attributable afterwards |
| SC-007 | A scoped user with no assignments gets an explanation, not an error |
| SC-008 | Answer "who can see this Bezirk?" without the database |
| SC-009 | A scope admin starts a run in their Bezirk with no platform admin involved |
| SC-010 | No run in any Bezirk needs a platform admin, given that Bezirk has a scope admin |
| SC-011 | A scope user reaches no import, edit or run capability anywhere |
| SC-012 | The system cannot be left with no active platform admin — **already true**; prove it |
| SC-013 | A revoked user's in-flight run still produces its snapshot; they cannot see it |

Run `webapp/validate.ps1` before commit — constitution Principle VI.

---

## Traps

- **Rebuilding the last-admin guard.** `ensureAdminUserCanChange` exists, inside a `Serializable` transaction with retry. FR-012a needs a test, not an implementation.
- **Widening the users page before the per-action checks.** The page loads every user. Order is the safety property.
- **Trusting the UI.** FR-024 and FR-019: every check holds at the API independently. Hiding a button is not authorisation.
- **Forgetting FR-023.** Without self-exclusion, a scope admin grants themselves a scope and FR-021 then passes for it. FR-021 constrains an instant; FR-023 makes it durable.
- **Prefix or fuzzy user search.** Enumerable in a few queries. Exact full email, at most one result (FR-027).
- **Adding a role.** None is needed. `SCOPE_ADMIN` already means scheduler; the page just never asks.
- **Cancelling in-flight runs on revoke.** FR-032: a run is the scope's work, not the person's. It finishes.
- **Making `checkScopeAccess` walk ancestors "for consistency".** Backwards. It is already right; the walk in `access.ts` is what goes.

---

## Out of scope

Creating or restructuring scopes (seed-only); new roles; authentication; source inheritance (a different mechanism — where data is *valid*, not who may *see* it); self-service access requests; time-limited grants; the WTTV-wide scheduler (FR-014 keeps it buildable — 13 assignments is the interim, and FR-015 exists so the interim stays tolerable enough that nobody reaches for a platform-admin grant instead).
