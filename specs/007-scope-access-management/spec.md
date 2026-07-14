# Feature Specification: Scope Access Management

**Feature Branch**: `007-scope-access-management`  
**Created**: 2026-07-14  
**Status**: Draft  
**Input**: User description: "Having permissions on the districts and also verband and be able to assign roles to users / that only some users can see all and others can only see certain district(s)."

**Terminology**: "Scope" is the existing system's word for a level of the Germany → Verband → Bezirk tree. A Bezirk is a scope; the Verband (WTTV) is a scope. Following feature 005, the UI names these levels "Bezirk" and "Verband", never "District".

## Clarifications

### Session 2026-07-14

- Q: Should a scope admin be able to import, review, and run within a Bezirk they hold? → A: Yes. A scope admin works in the scopes they hold, exactly as a platform admin does in any scope. The `scheduler` access level already declares this (`PLATFORM_ADMIN` and `SCOPE_ADMIN`) but the Raster page ignores it and hardcodes `PLATFORM_ADMIN` in seven places. This feature wires the page to the levels that already exist, so that assigning a scope grants the ability to work in it rather than only to look at it.
- Q: When a scope admin manages access, which users can they see? → A: Only users they find by searching an exact identifier. No browsable user list for scope admins. This keeps first-time grants possible without exposing the organisation's user directory to every Bezirk admin. Platform admins keep the full list.
- Q: What happens to a queued or running run when the user who started it loses access to that scope? → A: It finishes. A run is the scope's work, not the individual's, and it survives their access changing. The revoked user simply stops seeing it, like everything else in that scope. Revocation does not cancel compute.
- Q: Should the system prevent removing the last platform admin? → A: Yes. Demoting or deactivating the last active platform admin is refused, with a stated reason. Recovery from zero platform admins means editing the database by hand, which is the thing this feature exists to eliminate.
- Q: Should the Germany (DE) scope be assignable? → A: No. Only Bezirke and the Verband are assignable. Germany remains the root of the hierarchy and an owner of source material, but is not a level anyone is granted access to; under exact-match rules such an assignment would grant nothing.

## Context: what already exists

Most of the requested capability is built. The gap is narrower than "permissions".

**Already working:**

- `UserScopeAssignment` links a user to a scope, unique per pair.
- Three roles exist: `PLATFORM_ADMIN`, `SCOPE_ADMIN`, `SCOPE_USER`.
- A `PLATFORM_ADMIN` already sees every scope; scoped users already see a filtered set.
- Role assignment already has an API and a UI.

**Missing:**

- There is no way to assign a scope to a user. The users API exposes approve, deactivate, reactivate, role, and theme — and nothing for scopes. Neither the users page nor any users API route mentions scope. Assignments exist only because the seed creates them, so granting someone access to a Bezirk today means editing the database by hand. This is the feature.

**Broken, first:** a scope assignment currently grants only viewing. The access layer defines a `scheduler` level covering `PLATFORM_ADMIN` and `SCOPE_ADMIN` (`webapp/src/lib/raster/access.ts`), but the Raster page never consults it — it hardcodes `Role.PLATFORM_ADMIN` in seven places, gating every source upload, input-set creation, capacity edit, run start, and manual assignment. So a scope admin assigned to a Bezirk can look at it and do nothing else, and `SCOPE_ADMIN` is indistinguishable from `SCOPE_USER` in Raster. The intent exists in the access layer; it was never wired to the page.

**Broken, second:** two access rules disagree about what an assignment means.

- `checkScopeAccess` in `webapp/src/lib/rbac.ts` matches the assigned scope **exactly**, with no hierarchy walk.
- `listAccessibleRasterScopes` and `canAccessRasterDistrict` in `webapp/src/lib/raster/access.ts` match an assignment on the scope, **its parent, or its grandparent**.

So a user assigned to the Verband can reach every Bezirk's Raster data, while failing `checkScopeAccess` for those same Bezirke elsewhere. Both cannot be right. This feature settles it: an assignment grants that scope and nothing else.

**Consequence, accepted deliberately**: removing the hierarchy walk narrows current Raster access. A user assigned to the Verband stops seeing Bezirk data, and a genuine WTTV-wide scheduler needs one assignment per Bezirk. There is no production data, so no live access changes underfoot.

## Context: the WTTV-wide scheduler is coming, but not yet

A single scheduler responsible for every Bezirk and the Verband together is a known goal. It is not built here because the organisation has not established the role yet, and until it does, Bezirke and the Verband are planned separately by separate people. This feature serves that present reality.

Two things follow.

First, this is the same organisational change that feature `006-combined-wttv-planning` waits on. A WTTV-wide scheduler is the natural operator of a combined WTTV run, and both are gated on the same business precondition rather than on any technical one. They will likely arrive together.

Second, there is a gap in today's model worth naming. "Sees every scope" currently means exactly one thing: being a platform admin. A WTTV-wide scheduler who is not a platform admin has no representation — the only ways to express them today are 13 separate assignments, or granting them platform admin, which conflates system administration with planning reach. Neither is right. Whatever eventually represents this role (a cascading assignment, a Verband-wide grant, or a distinct role) is out of scope here, but FR-014 keeps it reachable.

**Not in play**: source inheritance. A Bezirk input set consuming Verband-level sources (`specs/003-raster-review-webapp/spec.md`, FR-008c) is a separate mechanism about where data is valid, not about who may see it. It is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Grant and revoke a user's access to a Bezirk or the Verband (Priority: P1)

A platform admin opens user management, picks a user, and grants them access to one or more Bezirke, or to the Verband. They can revoke access the same way. The grant means exactly the scopes named: assigning the Verband grants Verband-level data only, not the Bezirke beneath it.

**Why this priority**: It is the missing capability, and today the only alternative is editing the database by hand. Everything else here builds on it.

**Independent Test**: As a platform admin, grant a scoped user access to one Bezirk, sign in as that user, and verify they see exactly that Bezirk's Raster data and no other. Revoke it and verify the access disappears.

**Acceptance Scenarios**:

1. **Given** a user with no scope assignments, **When** a platform admin grants them a Bezirk, **Then** that user can reach that Bezirk's Raster data and no other scope's.
2. **Given** a user assigned to the Verband, **When** they open Raster, **Then** they see Verband-level data and no Bezirk beneath it.
3. **Given** a user with a scope assignment, **When** a platform admin revokes it, **Then** the user can no longer reach that scope's data.
4. **Given** a user with no scope assignments and a scoped role, **When** they open Raster, **Then** they are told they have no scopes rather than shown an error.
5. **Given** a platform admin, **When** they open Raster, **Then** they still see every scope without needing an assignment.
6. **Given** any scope grant or revoke, **When** it is applied, **Then** it is recorded in the audit trail with the actor, the user, the scope, and the change.
7. **Given** a user's scope list, **When** a platform admin views the user, **Then** the currently assigned scopes are visible without opening another page.

---

### User Story 2 - Work in the Bezirk you were granted (Priority: P2)

A scope admin granted a Bezirk imports its sources, reviews its data, starts its runs, and edits its gym capacities — the same work a platform admin can do anywhere, confined to the scopes they hold. A scope user granted the same Bezirk sees all of it and changes none of it.

**Why this priority**: Without it, User Story 1 grants the ability to look at a Bezirk and nothing more, and every run in all 13 Bezirke still routes through a platform admin. It is what makes an assignment worth granting. It is second only because a grant must exist before it can mean anything.

**Independent Test**: Grant a scope admin one Bezirk. Signed in as them, import a source, start a run in that Bezirk, and verify both succeed. Attempt the same in a Bezirk they do not hold and verify both are refused, by the API as well as the interface.

**Acceptance Scenarios**:

1. **Given** a scope admin holding a Bezirk, **When** they open it in Raster, **Then** they can import sources, review data, edit gym capacities, and start runs.
2. **Given** a scope admin holding a Bezirk, **When** they attempt to act on a Bezirk they do not hold, **Then** the attempt is refused by the API independently of what the interface shows.
3. **Given** a scope user holding a Bezirk, **When** they open it in Raster, **Then** they see its data and are offered no import, edit, or run controls.
4. **Given** a scope admin holding the Verband, **When** they open it in Raster, **Then** they can work on Verband-level planning and on no Bezirk beneath it.
5. **Given** a platform admin, **When** they open any scope, **Then** their capabilities are unchanged by this feature.

---

### User Story 3 - A Bezirk admin manages access to their own Bezirk (Priority: P3)

A scope admin can grant and revoke access to the scopes they themselves hold, without waiting on a platform admin. They cannot grant access to any scope they do not hold, and cannot raise anyone's role beyond their own.

**Why this priority**: It removes the platform admin as a bottleneck for routine access requests, but the system is usable without it — User Story 1 covers every grant, just centrally. It is also the most security-sensitive part, so it benefits from landing on top of a working, tested foundation.

**Independent Test**: As a scope admin holding one Bezirk, grant a user access to that Bezirk and verify it works. Then attempt to grant a Bezirk you do not hold, and verify it is refused.

**Acceptance Scenarios**:

1. **Given** a scope admin holding a Bezirk, **When** they grant a user access to that Bezirk, **Then** the grant succeeds.
2. **Given** a scope admin, **When** they attempt to grant a scope they do not hold, **Then** the attempt is refused, by the interface and by the API independently.
3. **Given** a scope admin, **When** they attempt to grant a user the platform admin role, **Then** the attempt is refused.
4. **Given** a scope admin, **When** they attempt to grant themselves an additional scope, **Then** the attempt is refused.
5. **Given** a scope admin, **When** they open user management, **Then** they can act only within their own scopes and the interface does not offer actions they cannot take.
6. **Given** a scope admin revokes a user's access, **When** the change is applied, **Then** it is audited with the acting scope admin recorded.

---

### User Story 4 - See who has access to what (Priority: P4)

An admin can see, for a scope, which users hold it, and for a user, which scopes they hold. They use it to answer "who can see OWL?" without reading the database.

**Why this priority**: It makes access reviewable rather than merely settable. It is genuinely useful but nothing is blocked without it, and User Story 1 already shows a user's own scope list.

**Independent Test**: With several users assigned across several scopes, open a scope and verify its user list is correct and complete.

**Acceptance Scenarios**:

1. **Given** several users assigned to a Bezirk, **When** an admin views that Bezirk's access, **Then** every user holding it is listed.
2. **Given** a scope with no users assigned, **When** an admin views its access, **Then** it is shown as having no users rather than as an error.
3. **Given** a scope admin, **When** they view access, **Then** they see it only for scopes they hold.

---

### Edge Cases

- A scoped user has no assignments at all, so they can see nothing.
- A user's last scope is revoked while they are working in it.
- A user's scope is revoked while they have a run queued or running in that scope.
- A user is deactivated but retains scope assignments.
- A scope admin's own scope is revoked, removing their ability to manage the users they just granted.
- A scope is deleted while users are assigned to it.
- A user holds both the Verband and a Bezirk.
- A platform admin is demoted to a scoped role and holds no assignments.
- The last platform admin is demoted or deactivated, leaving nobody able to grant scopes.
- A scope admin attempts to act on a user who holds scopes outside the admin's own.
- Two admins change the same user's assignments at once.

## Requirements *(mandatory)*

### Functional Requirements

#### Assignment

- **FR-001**: A platform admin MUST be able to grant a user access to any scope, and revoke it.
- **FR-002**: A user's currently assigned scopes MUST be visible wherever their access is managed.
- **FR-003**: Granting and revoking MUST be available through the application, with no database editing required for any routine access change.
- **FR-004**: A user MUST be able to hold several scopes at once.
- **FR-004a**: Only Bezirke and the Verband MUST be offered as assignable scopes. The Germany scope MUST NOT be assignable, since nothing is planned at that level and, under FR-010, such an assignment would grant access to nothing.
- **FR-005**: Granting a scope a user already holds MUST NOT create a duplicate or fail destructively.

#### Access semantics

- **FR-010**: A scope assignment MUST grant access to exactly that scope. It MUST NOT grant access to ancestor or descendant scopes.
- **FR-011**: All access checks across the application MUST apply the same rule as FR-010. The current disagreement between `rbac.ts` (exact match) and `raster/access.ts` (assignment, parent, or grandparent) MUST be resolved in favour of exact match.
- **FR-012**: A platform admin MUST continue to reach every scope without holding assignments.
- **FR-012a**: The system MUST refuse any change that would leave no active platform admin, whether by demotion or deactivation, and MUST state why. Recovery from zero platform admins requires editing the database, which this feature exists to make unnecessary.
- **FR-013**: A user holding a scoped role and no assignments MUST be able to sign in and MUST be told they have no scopes, rather than shown an error or an empty page with no explanation.
- **FR-014**: The exact-match rule of FR-010 MUST NOT foreclose a later WTTV-wide scheduler — one user with access to every Bezirk and the Verband, without being a platform admin. This feature does not build it; it must leave it buildable, whether as a cascading assignment, a Verband-wide grant, or a distinct role.
- **FR-015**: Granting many scopes to one user MUST remain workable in the meantime, since 13 assignments is the only way to express a WTTV-wide scheduler until FR-014's successor exists. Assignment MUST NOT be so laborious that it forces a platform admin grant instead.

#### What a scope grants

- **FR-016**: A scope admin MUST be able to do in the scopes they hold whatever a platform admin can do in any scope: import sources, review data, start runs, and edit gym capacities.
- **FR-017**: Capability MUST be determined by the user's role together with their access to the scope in question, not by a check for platform admin. The Raster page's seven hardcoded platform-admin checks MUST be replaced by the access levels the access layer already defines.
- **FR-018**: A scope user MUST retain viewing access without gaining the ability to import, review, or run.
- **FR-019**: Every capability opened up by FR-016 MUST be enforced at the API for the acting user and the scope acted on, independently of the interface.

#### Delegated administration

- **FR-020**: A scope admin MUST be able to grant and revoke access to scopes they themselves hold.
- **FR-021**: A scope admin MUST NOT be able to grant, revoke, or view access for any scope they do not hold.
- **FR-022**: A scope admin MUST NOT be able to grant a role higher than their own, and MUST NOT be able to grant the platform admin role.
- **FR-023**: A scope admin MUST NOT be able to alter their own scope assignments.
- **FR-024**: Every restriction in FR-021 through FR-023 MUST be enforced at the API independently of the interface. Hiding an action in the UI MUST NOT be the only thing preventing it.
- **FR-025**: User management MUST become reachable by scope admins, showing only what they may act on. It is currently reachable only by platform admins.
- **FR-026**: A scope admin MUST be able to find a user by searching an exact identifier, so they can grant a scope to someone who holds none yet.
- **FR-027**: A scope admin MUST NOT be able to browse or enumerate the user list. Search MUST require an exact identifier and MUST NOT return partial matches or allow listing.
- **FR-028**: A platform admin MUST retain the full browsable user list.
- **FR-029**: Search MUST NOT reveal whether a non-matching identifier belongs to an existing user, beyond what granting itself requires.

#### Auditability

- **FR-030**: Every grant and revoke MUST be recorded in the audit trail with the actor, the affected user, the scope, and the direction of the change.
- **FR-031**: A refused grant or revoke MUST NOT alter any assignment.

#### Revocation and work in flight

- **FR-032**: Revoking a user's access to a scope MUST NOT cancel or interrupt runs already queued or executing in that scope. A run belongs to the scope, not to the user who started it.
- **FR-033**: A run started before revocation MUST complete, and its snapshot MUST remain available to users who still hold the scope.
- **FR-034**: A user whose access is revoked MUST immediately stop being able to see or act on that scope's runs and snapshots, including any they started.

#### Review

- **FR-040**: An admin MUST be able to see which users hold a given scope.
- **FR-041**: An admin MUST be able to see which scopes a given user holds.
- **FR-042**: A scope admin MUST see the above only for scopes they hold.

### Key Entities

- **User scope assignment**: Links a user to a scope, at most once per pair. Already exists. This feature gives it a way to be created and removed, and settles what it means.
- **Scope**: An existing hierarchy node — Germany → Verband → Bezirk. Unchanged by this feature.
- **Role**: `PLATFORM_ADMIN`, `SCOPE_ADMIN`, `SCOPE_USER`. Already assignable. This feature does not add roles; it constrains who may assign them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can grant a user access to a Bezirk in under 30 seconds, without touching the database.
- **SC-002**: A user assigned to one Bezirk can reach that Bezirk's data and no other scope's, verified across every part of the application that checks access.
- **SC-009**: A scope admin granted a Bezirk can start a run in it without any platform admin involvement.
- **SC-010**: No run in any Bezirk requires a platform admin, provided that Bezirk has a scope admin.
- **SC-011**: A scope user can reach no import, edit, or run capability in any scope, whatever they are assigned.
- **SC-003**: A user assigned to the Verband reaches Verband-level data and no Bezirk beneath it.
- **SC-004**: Access decisions are identical everywhere in the application for the same user and scope, with no path granting more than another.
- **SC-005**: A scope admin cannot obtain access to a scope they do not hold, through the interface or by calling the API directly.
- **SC-006**: Every access change is attributable to an actor after the fact.
- **SC-007**: A user with a scoped role and no assignments receives a clear explanation rather than an error.
- **SC-008**: An admin can answer "who can see this Bezirk?" without reading the database.
- **SC-012**: The system can never be left with no active platform admin through any action available in the application.
- **SC-013**: A revoked user's in-flight run still produces its snapshot for the scope, and the revoked user cannot see it.

## Assumptions

- The scope hierarchy itself (which Bezirke exist, and that they sit under WTTV) is managed by seeding and is not edited in the app. This feature assigns users to scopes; it does not create scopes.
- Role assignment already exists and works; this feature constrains who may use it rather than rebuilding it.
- Planning at the Germany level is not a real case, consistent with feature 005, so the Germany scope is not assignable (FR-004a). It remains the root of the hierarchy and may still own source material.
- There is no production data, so narrowing access from the current hierarchy walk to exact match cannot disrupt a live user.
- Bezirke and the Verband are planned separately, by separate people, for now. A single WTTV-wide scheduler is a known goal but is not yet established on the business side, so this feature serves the present arrangement and keeps the future one reachable (FR-014).
- Per-Bezirk assignment (13 assignments for a WTTV-wide scheduler) is acceptable as an interim, because the role does not exist yet. Once it does, the interim stops being acceptable and FR-014's successor is needed.
- The WTTV-wide scheduler and feature 006's combined WTTV run wait on the same organisational change, not on separate ones. Whichever arrives first, the other is likely close behind.
- Existing audit infrastructure is reused; this feature adds entries rather than an audit mechanism.
- Existing authentication is unchanged. This feature is about authorisation only.

## Out of Scope

- Creating, renaming, or restructuring scopes.
- Adding new roles or changing what existing roles may do beyond scope assignment.
- Any change to authentication, sign-in, or SSO.
- Source inheritance, which governs where source material is valid rather than who may see it, and is unchanged.
- Self-service access requests, approval workflows, or time-limited grants.
- A WTTV-wide scheduler role — one user covering every Bezirk and the Verband without platform admin rights. A known goal, blocked on the organisation establishing the role, and gated on the same business change as feature 006. FR-014 keeps it buildable; this feature does not build it.

## Open Questions

- **Q1 (resolved 2026-07-14)**: A scope admin finds users by exact-identifier search only, with no browsable list. Platform admins keep the full list. See FR-026 to FR-029.
- **Q2 (resolved 2026-07-14)**: The Germany scope is not assignable. Only Bezirke and the Verband are. See FR-004a.
- **Q3 (resolved 2026-07-14)**: A queued or running run finishes despite its starter losing access. A run is the scope's work and survives personnel changes; the revoked user simply stops seeing it. See FR-032 to FR-034.
