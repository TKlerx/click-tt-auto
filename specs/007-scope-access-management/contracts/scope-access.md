# Phase 1 Contracts: Scope Access Management

**Feature**: `007-scope-access-management` | **Date**: 2026-07-15

One new endpoint pair, one new lookup, one changed authorisation level across existing raster routes, and one page whose gate moves from the top to each action.

---

## New: scope assignment

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/users/[id]/scopes` | `POST` | Grant a scope (FR-001, FR-020) |
| `/api/users/[id]/scopes` | `DELETE` | Revoke a scope |
| `/api/users/[id]/scopes` | `GET` | Which scopes this user holds (FR-041) |

Follows `/api/users/[id]/role` — a thin route delegating to a service (`services/api/scope-assignments.ts`), matching `updateManagedUserRole`.

### Authorisation, per request

Every one of these is enforced **in the service**, not the route and not the UI (FR-024):

| Rule | Applies to | Requirement |
|---|---|---|
| Platform admin may grant any assignable scope | `PLATFORM_ADMIN` | FR-001 |
| Scope admin may grant only scopes they hold | `SCOPE_ADMIN` | FR-021 |
| Scope admin may not alter their own assignments | `SCOPE_ADMIN` | FR-023 |
| Germany is never assignable | all | FR-004a |
| Granting a held scope is a no-op, not an error | all | FR-005 |
| Refused requests alter nothing | all | FR-031 |

**FR-023 is not a nicety.** Without self-exclusion, a scope admin holding OWL grants themselves Köln; FR-021 then passes for Köln, and the boundary has moved. FR-021 constrains an instant; FR-023 is what makes it hold over time.

### Audit

Every grant and revoke records actor, target user, scope and direction via the existing `safeLogAudit` (FR-030). A refused attempt records nothing and changes nothing (FR-031).

---

## New: user lookup for scope admins

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/users/lookup?email=<exact>` | `GET` | Find one user by exact email (FR-026) |

**Contract**:

- Matches the **full** email, exactly. No prefix, no substring, no wildcard, no `LIKE` (FR-027).
- Returns at most one user, or nothing. Never a list.
- A non-match returns a uniform "no user found" (FR-029).
- Available to `SCOPE_ADMIN` and `PLATFORM_ADMIN`.

Platform admins keep the existing `listUsers` (FR-028). Scope admins have no listing endpoint at all — not a filtered one, not a paginated one. The absence *is* the contract.

---

## Changed: raster authorisation level

Raster API routes currently gate scheduling work at `"admin"`:

```
requireRasterInputSet(request, id, "admin")
```

which resolves to `levelRoles.admin = [PLATFORM_ADMIN]`. That is why a scope admin cannot start a run in their own Bezirk.

**Becomes `"scheduler"`** for the work: source upload/refresh/delete, input-set creation, group review, capacity edit, validation, run start, manual assignment (FR-016, FR-017).

`levelRoles.scheduler` already reads `[PLATFORM_ADMIN, SCOPE_ADMIN]` — no change to the levels themselves. `"admin"` stays platform-only for anything genuinely system-level. `"viewer"` keeps `SCOPE_USER` at read (FR-018).

**The seven page checks are the visible half; these routes are the enforcing half.** Changing the page alone would show buttons that 403. Changing the routes alone would leave the capability unreachable. Both, and the routes are what FR-019 is about.

---

## Changed: users page

| Actor | Sees |
|---|---|
| `PLATFORM_ADMIN` | The full user list, every action (FR-028) |
| `SCOPE_ADMIN` | No list. Exact-email lookup, then actions confined to scopes they hold (FR-025, FR-027) |
| Others | Not authorized, as today |

Today the page gates once, in the component (`page.tsx:12`), then loads every user. Widening that gate without restructuring hands the directory to every Bezirk admin.

So the **data load becomes actor-dependent**, and each action carries its own authorisation. The order of work matters: per-action authorisation first, widen the gate second. The reverse, even briefly, is a privilege escalation.

---

## Unchanged

- `/api/users/[id]/role` keeps its contract and its last-admin guard (**already implemented** — `ensureAdminUserCanChange`). It gains a ceiling: a scope admin may not grant a role above their own (FR-022). Granting an equal role is permitted.
- `/api/users/[id]/approve`, `/deactivate`, `/reactivate`, `/theme` — unchanged.
- Authentication — untouched. This feature is authorisation only.
