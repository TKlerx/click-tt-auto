# Research: Manual Baseline Rasterzahlen Import

## Reuse the authenticated assignment scraper

**Decision**: Reuse `scrapeCurrentTeamRasterAssignments()` and `scrapeTeamRasterAssignments()` from `src/raster/ingest/`.

**Rationale**: They already log in through Playwright, navigate through live `SpielbetriebOrganisation` links, distinguish duplicate group labels by occurrence, and return group/team/Rasterzahl/source URL rows. That is the required baseline payload.

**Alternatives considered**: Replaying collected admin URLs is unsafe because their click counters are stateful. A second crawler would duplicate the fragile navigation logic.

## Version and activate imports atomically

**Decision**: Each refresh creates a new `IMPORTING` baseline version. Only a fully stored import becomes active; activation and previous-version deactivation happen in one transaction. A partial or failed import is retained as `FAILED` and never replaces the active version.

**Rationale**: This directly preserves the last usable baseline and gives runs an immutable version to reference.

**Alternatives considered**: Updating rows in place loses history and can leave a half-refreshed active baseline. Deleting failed versions loses diagnostics.

## Keep review decisions on stable source identity

**Decision**: Compute a stable source identity key from normalized group and team labels. Copy a previous decision only when that key is unchanged and the mapped target still exists in the workspace season model. Rasterzahl changes do not invalidate identity mapping; group/team identity changes do.

**Rationale**: Review decisions answer “which team is this?”, not “is this numeric value unchanged?”.

**Alternatives considered**: Including Rasterzahl in the identity key would force needless review after every legitimate reassignment. Using the stateful source URL as identity is unreliable.

## Attach baseline to a run, not the solver model

**Decision**: Add nullable `baselineId` to `RasterOptimizationRun`, validate that it is `READY` and belongs to the same input set at run creation, and compute deltas when reading the resulting snapshot.

**Rationale**: The run relation records the exact version while keeping baseline values out of solver inputs and hard-constraint code paths.

**Alternatives considered**: Copying baseline assignments into run settings is denormalized and weakly validated. Adding them to fixed assignments violates FR-006 and FR-014.

## Reuse the existing review and result surfaces

**Decision**: Add baseline review to the existing raster review page, baseline selection to existing run controls, and deltas to the existing snapshot page.

**Rationale**: These are the points where schedulers already resolve imported uncertainty, start runs, and inspect outcomes.

**Alternatives considered**: A new baseline application/page tree would duplicate navigation and access checks.

## Run Playwright in the app process

**Decision**: Keep the import request-driven through the existing Node/Playwright path, add a database constraint preventing concurrent workspace imports, promote the repo's existing Playwright package into webapp production dependencies, and install/copy Chromium in `Dockerfile.app`.

**Rationale**: The Python worker image does not contain Node or Playwright. Extending it would create a second JavaScript runtime and duplicate app service logic. The existing source refresh path is already request-driven.

**Alternatives considered**: A new crawler service or Node worker is operationally heavier. Adding Node, pnpm, Playwright, and browsers to the Python worker is broader than this feature requires.
