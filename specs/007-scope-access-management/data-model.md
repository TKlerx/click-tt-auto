# Phase 1 Data Model: Scope Access Management

**Feature**: `007-scope-access-management` | **Date**: 2026-07-15

**No schema change.** This feature is unusual in that its entire data model already exists. Everything below is documentation of what is there and what this feature makes of it.

---

## Unchanged: UserScopeAssignment

The feature's central entity. Already present.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` | FK to `User`, `onDelete: Cascade` |
| `scopeId` | `String` | FK to `Scope`, `onDelete: Cascade` |
| `createdAt` | `DateTime @default(now())` | |

**Uniqueness**: `@@unique([userId, scopeId])` — already there, and it is what makes FR-005 (granting a held scope is not destructive) an upsert rather than a check-then-insert race.

**What this feature adds**: nothing to the model. A way to create and delete rows, and a settled meaning for what a row grants.

### What a row means, after FR-010

Exactly the named scope. Not its ancestors, not its descendants.

This is a **narrowing** of today's effective behaviour: `raster/access.ts` currently treats a row as also granting the scope's children and grandchildren. Removing that walk is the change; the row itself is untouched.

### `onDelete: Cascade` on `scopeId`

Worth noting because a spec edge case asks what happens when a scope is deleted while users are assigned. The answer is already decided: the assignments vanish. That is acceptable — scope creation and deletion are seed-only, and a scope that no longer exists cannot meaningfully be held. No change needed; the edge case is closed by existing schema.

---

## Unchanged: Scope

| Field | Notes |
|---|---|
| `id`, `code`, `name` | `code` and `name` both unique |
| `parentId` / `parent` / `children` | Self-relation. `DE` → `WTTV` → 13 Bezirke |
| `userAssignments` | The relation this feature exercises |

**Level derivation**: parent is root → Verband; grandparent is root → Bezirk. Feature 005 adds `lib/raster/scope-level.ts` for this; this feature reuses it for FR-004a (Germany is not assignable) and for labels.

**Not assignable**: the Germany root (FR-004a). Under exact-match semantics an assignment to it would grant access to nothing, since nothing is planned at that level. Enforced in the service layer — Prisma cannot express "FK to a subset of rows".

---

## Unchanged: User and Role

| Role | Meaning after this feature |
|---|---|
| `PLATFORM_ADMIN` | Every scope without assignments (FR-012). Full user list (FR-028). May grant any scope (FR-001) |
| `SCOPE_ADMIN` | Works in scopes they hold — import, review, capacity, runs (FR-016). May grant those scopes to others (FR-020), not to themselves (FR-023) |
| `SCOPE_USER` | Views scopes they hold. No import, edit or run (FR-018) |

**No role is added.** The spec's Out of Scope says so explicitly, and R-202 explains why none is needed: `SCOPE_ADMIN` already means "scheduler" in the access layer — the Raster page simply never asks.

---

## Existing behaviour this feature depends on

| What | Where | Why it matters |
|---|---|---|
| `ensureAdminUserCanChange` | `services/api/user-admin.ts` | **Already implements FR-012a.** Refuses to change or deactivate the last admin, inside a `Serializable` transaction with retry. Do not rebuild it — verify and test it |
| `levelRoles` | `lib/raster/access.ts` | Declares `scheduler: [PLATFORM_ADMIN, SCOPE_ADMIN]`. The intent FR-016 makes real |
| `checkScopeAccess` | `lib/rbac.ts` | Already exact-match. One caller (`route-context.ts:80`). FR-011 resolves in its favour |
| `safeLogAudit` | `lib/audit.ts` | FR-030's attribution. Add entries; do not build a mechanism |
| `withSerializableRetry` | `services/api/user-admin.ts` | The concurrency pattern for grant/revoke, matching role changes |

---

## Validation rules

| Rule | Source | Enforced |
|---|---|---|
| Only Bezirke and the Verband are assignable | FR-004a | Service layer + test. Not expressible in Prisma |
| A user may hold several scopes | FR-004 | Already true — `@@unique([userId, scopeId])` is per pair |
| Granting a held scope is not destructive | FR-005 | Upsert on the unique pair |
| A scope admin grants only scopes they hold | FR-021 | Authorisation helper, enforced at the API (FR-024) |
| A scope admin grants no role above their own | FR-022 | Same helper. Granting an equal role (`SCOPE_ADMIN`) is permitted |
| A scope admin never alters their own assignments | FR-023 | Same helper. **This is what makes FR-021 durable** — without it, a scope admin grants themselves a scope and FR-021 then passes for it |
| The last platform admin cannot be removed | FR-012a | **Already enforced.** Verify only |
| Search returns at most one exact match | FR-026, FR-027 | Service layer + test |

---

## Concurrency

Grant and revoke follow the pattern `updateManagedUserRole` already uses: a `Serializable` transaction with `withSerializableRetry`.

This matters for one spec edge case — two admins changing the same user's assignments at once. The unique constraint makes a duplicate grant harmless; serializable isolation makes a concurrent grant-and-revoke resolve to one outcome rather than a lost update.

---

## Migration approach

**None.** No schema change, so nothing to migrate.

Existing `UserScopeAssignment` rows are seeded (`prisma/seed.ts` assigns the demo user to OWL) and stay valid — their meaning narrows under FR-010, but the seeded assignments are Bezirk-level, where exact-match and the ancestor walk agree.

The narrowing only changes behaviour for a user assigned to `WTTV` or `DE`, and the seed creates no such assignment. So even the behaviour change touches nothing that exists.
