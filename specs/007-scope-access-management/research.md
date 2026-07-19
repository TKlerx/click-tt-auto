# Phase 0 Research: Scope Access Management

**Feature**: `007-scope-access-management` | **Date**: 2026-07-15

IDs numbered from R-201 to avoid collision with features 005 (R-001–R-008) and 006 (R-101–R-106).

---

## R-201: Which access rule survives, and what does removing the other cost?

**Decision**: Exact match wins (FR-011). `rbac.ts` already does this and is correct; the ancestor walk in `raster/access.ts` is removed.

**Rationale**: Two rules disagree today. `checkScopeAccess` in `webapp/src/lib/rbac.ts` matches the assigned scope exactly. `canAccessRasterDistrict` and `listAccessibleRasterScopes` in `webapp/src/lib/raster/access.ts` match on the assignment, **its parent, or its grandparent**. So a user assigned to the Verband reaches every Bezirk's Raster data while failing `checkScopeAccess` for those same Bezirke elsewhere.

The blast radius is smaller than it first appears in each direction:

- `checkScopeAccess` has **exactly one caller** — `webapp/src/services/api/route-context.ts:80`, behind `options.scopeRestricted`. Keeping it costs nothing.
- The ancestor walk lives in two functions in one file. Removing it is local.

The cost is real but bounded: a Verband assignment stops conferring Bezirk access, and a WTTV-wide scheduler needs 13 assignments. No production data exists, so nothing shifts under a live user. FR-014 keeps a cascading grant buildable later; FR-015 requires bulk assignment to stay tolerable so nobody reaches for a platform-admin grant instead.

**Alternatives considered**:
- *Cascade wins*: fewer assignments for a WTTV-wide role, but every assignment's blast radius becomes implicit — "assigned to WTTV" would silently mean 14 scopes. The explicit version is auditable; FR-014 leaves the door open if the tedium proves real.
- *Per-assignment cascade flag*: the eventual answer if a WTTV-wide scheduler materialises, and premature now. It is FR-014's most likely shape.

---

## R-202: How does a scope admin gain the ability to act?

**Decision**: Replace the seven hardcoded `Role.PLATFORM_ADMIN` checks in the Raster page with the existing `RasterAccessLevel` levels, and change the API routes that gate on `"admin"` to gate on `"scheduler"`.

**Rationale**: `webapp/src/lib/raster/access.ts` already defines the intent:

```
viewer:    [PLATFORM_ADMIN, SCOPE_ADMIN, SCOPE_USER]
scheduler: [PLATFORM_ADMIN, SCOPE_ADMIN]
admin:     [PLATFORM_ADMIN]
```

A scope admin is already declared a scheduler. The Raster page never consults this — it checks `user.role === Role.PLATFORM_ADMIN` in seven places, gating every source upload, input-set creation, capacity edit, run start and manual assignment. So `SCOPE_ADMIN` is today indistinguishable from `SCOPE_USER` in Raster.

The mapping is: **scheduler** for import, review, capacity edit and run start (the work); **admin** stays platform-only for anything genuinely system-level. FR-018 keeps `SCOPE_USER` at viewer.

Note the API side is the larger half. `requireRasterInputSet(request, id, "admin")` appears across the raster routes; those become `"scheduler"`. The page checks are the visible half but the routes are the enforcing half — FR-019 exists because hiding a button is not authorisation.

**Alternatives considered**:
- *A new role*: unnecessary. The role exists and means this.
- *Widen `levelRoles.admin` to include `SCOPE_ADMIN`*: collapses the distinction between scheduling work and system administration, and would grant scope admins anything later gated at `admin`.

---

## R-203: How is delegated administration enforced without escalation?

**Decision**: One authorisation helper deciding "may actor A grant scope S to user U", called by the endpoint and by nothing else. The UI asks the same helper to decide what to offer, but the endpoint's call is the enforcement.

**Rationale**: FR-021 to FR-024 are the escalation surface: a scope admin must not grant beyond scopes they hold (FR-021), must not grant a role above their own (FR-022), must not alter their own assignments (FR-023), and every one of those must hold at the API regardless of the interface (FR-024).

The failure mode is scattering these checks — one in the dialog, one in the endpoint, one forgotten. A single helper with one enforcing caller makes "did we check?" answerable by reading one file.

FR-023 (no self-modification) deserves emphasis: without it a scope admin holding OWL could grant themselves Köln, and the FR-021 check would then pass for Köln. Self-exclusion is what makes FR-021 hold over time rather than instantaneously.

**Alternatives considered**:
- *Check in the endpoint only*: correct but offers users actions that then fail.
- *Middleware*: the decision needs the target user and scope from the body, which middleware would have to parse anyway.

---

## R-204: Is the last-platform-admin guard needed?

**Decision**: It already exists. Verify and test it; do not build it.

**Rationale**: `ensureAdminUserCanChange` in `webapp/src/services/api/user-admin.ts` already refuses to change the last admin's role ("Cannot change role of the last Admin user", line 347) and carries a `lastAdminMessage` path for status changes. Both run inside a `Serializable` transaction with retry, which is the right isolation — two concurrent demotions could otherwise each see another admin remaining.

FR-012a is therefore satisfied by existing code. The clarify session asked whether to prevent lockout and the answer was yes; the answer was already implemented. What remains is a test proving it, since nothing currently pins the behaviour.

**Consequence**: FR-012a's task is verification, not construction. Worth stating plainly so nobody re-implements a guard that exists.

---

## R-205: How is exact-identifier search built without enabling enumeration?

**Decision**: A lookup returning at most one user, matching the full email exactly, with no partial matching, no wildcards, and no listing. Available to scope admins; platform admins keep `listUsers`.

**Rationale**: FR-026 requires a scope admin to find a user holding no scopes yet — the common case for a first grant. FR-027 forbids browsing or enumerating. Exact match on the full email satisfies both: you can act on someone you already know of, and you cannot discover who exists.

FR-029 (search must not reveal whether a non-matching identifier belongs to a user) is weaker than it sounds and should not be over-engineered. Granting access to an address inherently confirms it exists — the requirement is that *search itself* adds no signal beyond what granting requires. A uniform "no user found" response satisfies it.

**Alternatives considered**:
- *Prefix or fuzzy search*: friendlier, and enumerable with a few queries. Directly contradicts FR-027.
- *Return the full list, filter client-side*: the list crosses the wire. FR-027 is a server concern.

---

## R-206: How does user management open to scope admins?

**Decision**: Replace the page-level role gate with per-action authorisation, driven by R-203's helper, and scope the data the page loads to what the actor may see.

**Rationale**: `webapp/src/app/(dashboard)/users/page.tsx:12` returns "not authorized" unless `user.role === Role.PLATFORM_ADMIN`, then loads **every** user with `prisma.user.findMany()`. That single gate is the only thing standing between a non-admin and the full user list.

Widening it to `SCOPE_ADMIN` without restructuring would hand every Bezirk admin the whole directory — violating FR-027 immediately. So the page's data load becomes actor-dependent: platform admins get the list, scope admins get search only (R-205).

This is the feature's riskiest change, and it is a subtraction of a guard before an addition of finer ones. The order matters: build the per-action authorisation first, open the page second.

**Alternatives considered**:
- *A separate page for scope admins*: avoids touching the existing gate, and duplicates the table, the actions and the authorisation. Two places to get right instead of one.
- *Keep users platform-admin-only, delegate elsewhere*: contradicts FR-025, and delegation is the whole of User Story 3.

---

## Resolved unknowns summary

| ID | Unknown | Decision |
|---|---|---|
| R-201 | Which access rule | Exact match; remove the ancestor walk. One caller of `checkScopeAccess` |
| R-202 | Scope admin acting | Use the existing `scheduler` level; routes move `"admin"` → `"scheduler"` |
| R-203 | Escalation | One authorisation helper, one enforcing caller. FR-023 is what makes FR-021 durable |
| R-204 | Last-admin guard | **Already exists.** Verify and test; do not rebuild |
| R-205 | User search | Exact full-email match, at most one result, no listing |
| R-206 | Opening the users page | Per-action authorisation first, then widen the gate. Data load becomes actor-dependent |

**No NEEDS CLARIFICATION remain.** Spec Q1, Q2 and Q3 were resolved in the clarify session.
