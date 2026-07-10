# Research: API Route Refactor

**Feature**: 011-route-refactor | **Date**: 2026-04-01

## R1: Where shared route logic should live

**Decision**: Create route orchestration helpers under `C:\dev\webapp-template\src\services\api\...` and leave lower-level infrastructure helpers in `src/lib`.

**Rationale**: The spec explicitly requires an app-level `services/` area. The current `src/lib` folder already mixes durable infrastructure helpers such as auth, Prisma access, HTTP helpers, and audit logging. Moving route orchestration into `src/services/api` gives API-specific reuse a clear home without forcing unrelated infrastructure code to move.

**Alternatives considered**:

- Keep adding helpers to `src/lib` â€” would blur the boundary between durable primitives and route-specific orchestration.
- Create per-route-family helper files inside `src/app/api/...` â€” reduces visibility and makes shared ownership harder across route families.

## R2: Shared authorization/context pattern

**Decision**: Preserve the existing short-circuit result pattern for route guards: helpers may return `{ error: Response }` or a typed success context such as `{ user }` or `{ actor, user }`.

**Rationale**: The current routes already follow this shape with `requireApiUser`, `requireApiUserWithRoles`, and `requireManagedUser`. Reusing that pattern minimizes risk, keeps route entrypoints readable, and avoids broad rewrites to exception-based or middleware-driven control flow.

**Alternatives considered**:

- Throw exceptions from helpers and catch them centrally â€” harder to trace in route handlers and more disruptive to existing tests.
- Return only plain data and let routes re-create error responses â€” would duplicate the exact behavior we are trying to centralize safely.

## R3: First refactor targets should be measured duplication hotspots

**Decision**: Start with the user status routes (`approve`, `deactivate`, `reactivate`) and audit routes (`/api/audit`, `/api/audit/export`) before broader auth-route cleanup.

**Rationale**: A local jscpd run on `src/app/api` reports 5.74% duplicated lines, above the repo's 3% threshold. The clearest clones are the user status mutation routes and the repeated audit filter parsing in list/export routes. Refactoring those first gives the highest duplication reduction with the lowest behavior risk.

**Alternatives considered**:

- Start with the auth routes â€” valuable, but current auth routes also mix Better Auth response handling and rate-limit behavior, which is riskier than the user status and audit families.
- Sweep every route at once â€” violates incremental delivery and makes regression isolation harder.

## R4: Route duplication policy for Next.js entrypoints

**Decision**: Allow minimal duplication for route entrypoint ceremony only: exported HTTP verb functions, `Request`/`params` unpacking, and final response shaping. Shared auth checks, repeated query parsing, repeated Prisma mutation sequences, and duplicated audit side effects must move to services.

**Rationale**: Next.js App Router route files naturally repeat some framework-mandated shape. Trying to eliminate all of that would create abstractions that hide route intent. The constitution prefers the smallest helpful abstraction, so the policy must distinguish unavoidable entrypoint ceremony from truly repeated business logic.

**Alternatives considered**:

- Treat any route-level duplication as a failure â€” encourages overly generic wrappers.
- Ignore route duplication entirely â€” conflicts with the constitution and the current jscpd gate.

## R5: How far to abstract current mutation flows

**Decision**: Keep shared mutation helpers narrow and domain-specific, modeled after the existing `updateManagedUserStatus` helper rather than creating a generic CRUD framework.

**Rationale**: The current user-management helper already shows the right level of abstraction: it centralizes actor/target loading, optional status checks, last-admin protection, and post-update hooks, while letting each route keep its own audit behavior. This is the project's preferred pattern for behaviorally sensitive refactors.

**Alternatives considered**:

- Build a generic mutation pipeline for all routes â€” too abstract for the current codebase and likely to hurt readability.
- Keep all mutation logic inline â€” leaves the measured duplication unresolved.

## R6: How to handle spec examples that do not exist in the starter yet

**Decision**: Document `DocumentVersionMutation` and `AIRequestOrchestration` as future service contracts only. Do not invent Prisma models, API endpoints, or placeholder implementation files for them in this starter.

**Rationale**: The current repository has no `Document`, `DocumentVersion`, analysis, or rewrite routes. Creating abstractions for absent domains would violate Simplicity First and make the plan less credible. The higher-level spec examples still matter, so the design artifacts capture the contract shape for downstream or future work without pretending those flows are ready to implement here.

**Alternatives considered**:

- Ignore those requirements completely â€” would leave the spec-to-repo mismatch undocumented.
- Add placeholder code now â€” speculative abstraction with no in-repo consumer.

## R7: Verification strategy for a behavior-preserving refactor

**Decision**: Use existing route tests as the primary regression safety net, add targeted unit tests for new service helpers when extraction creates logic branches, and keep duplication checks in the validation loop.

**Rationale**: This feature is intentionally non-behavioral. The best proof is that existing route tests still pass unchanged. Helper extraction may still introduce new branch points, so small helper-level unit tests are justified when the route tests alone would not explain a failure quickly.

**Alternatives considered**:

- Rely only on code review â€” insufficient for authorization-sensitive routes.
- Add a new contract-test harness first â€” useful later, but too much setup for the immediate refactor.

## R8: Continuity and sequencing handling for this planning pass

**Decision**: Proceed with `011-route-refactor` planning because the user explicitly requested it on 2026-04-01, while recording the mismatch between `specs/OVERVIEW.md`, `CONTINUE.md`, and `ACTIVE_SPECS.md` as a follow-up item.

**Rationale**: The constitution requires an explicit warning and confirmation before working on a newer started spec. The explicit user request satisfies the confirmation requirement, but the plan must also make the continuity inconsistency visible so implementation work does not silently inherit it.

**Alternatives considered**:

- Refuse to plan `011` until continuity files are repaired â€” safer procedurally, but would ignore the user's direct instruction.
- Ignore the inconsistency â€” violates the constitution.
