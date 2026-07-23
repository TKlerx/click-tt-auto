# Feature Specification: Raster Import UX

**Feature Branch**: `011-raster-import-ux`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: User description: "Improve Raster import UX so scope and season act as page context, input sets are selected once as planning workspaces, source upload/register actions apply to the selected workspace by default, and the primary import flow avoids bottom-of-page hidden actions and redundant selectors."

## Clarifications

### Session 2026-07-16

- Q: Should uploaded and registered sources belong to the selected planning workspace, remain shared by scope and season, or use a hybrid model? → A: Sources belong to the selected planning workspace by default.
- Q: What should happen when a user tries to add sources before any planning workspace exists? → A: Require or create a workspace first; source actions are disabled until one exists.
- Q: Should saving a source parse it immediately or keep parsing as a separate action? → A: Saving only registers or uploads the source, then shows a prominent Parse next action.
- Q: Should source forms allow choosing a different scope from the current page context? → A: Default flow only uses current scope; no scope picker on source forms.
- Q: What information is required when creating a planning workspace? → A: Workspace has only a user-visible name; first default is scope + season.

### Session 2026-07-19

- Q: When workspaces arrive, what happens to existing scope+season sources that belong to no workspace? → A: Auto-assign them to the first workspace for that scope+season when it is created/selected (FR-009b). No lingering "unowned" state.
- Q: How is the selected planning workspace tracked across navigation and refresh? → A: In the page URL as a query parameter, exactly as scope and season are (FR-008a) — shareable, bookmarkable, refresh-safe.
- Q: Which users may create workspaces and add/parse sources? → A: Feature 007's scheduler level — `PLATFORM_ADMIN`, or `SCOPE_ADMIN` holding the scope; `SCOPE_USER` gets a read-only view (FR-016).
- Q: When the user changes scope or season while a workspace is selected? → A: Reset the selection and re-apply the auto-select rule for the new context (FR-007a).

### Session 2026-07-21

- Q: How should club identity mismatches between the season model and wish/capacity imports be handled when fuzzy matching misses real aliases? → A: Review must be exhaustive for unresolved capacity-relevant model clubs. The system may preselect one strong suggestion, but must still show an empty manual selector when no unique suggestion exists, so future naming variants are not hidden.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import sources in current context (Priority: P1)

A raster planner working inside a selected scope and season can add a click-TT group URL or wish PDFs without reselecting scope or wondering which season the data belongs to.

**Why this priority**: The current page asks for context the user already selected and hides the season, which creates avoidable mistakes and confusion during the core import task.

**Independent Test**: Can be tested by navigating to a scope/season import page, adding one click-TT URL and one wish PDF, and confirming both are associated with the visible page context without any repeated scope selection.

**Acceptance Scenarios**:

1. **Given** the user is on the import page for OWL and 2026/27, **When** they add a click-TT group URL, **Then** the source is saved for OWL and 2026/27 without requiring another scope selection.
2. **Given** the user is on the import page for OWL and 2026/27, **When** they upload wish PDFs, **Then** the PDFs are saved for OWL and 2026/27 without requiring another scope selection.
3. **Given** the add-source controls are visible, **When** the user reviews them, **Then** the current scope and season are plainly visible before submission.

---

### User Story 2 - Work with one selected planning workspace (Priority: P1)

A raster planner can see which input set, presented as a planning workspace, is active and have all source actions apply to that selected workspace by default.

**Why this priority**: Input sets are necessary for multiple planning versions, but users should select the workspace once rather than choose it repeatedly or discover it as a hidden prerequisite.

**Independent Test**: Can be tested by creating or selecting a workspace and confirming add, parse, validate, and review actions affect that workspace's own sources.

**Acceptance Scenarios**:

1. **Given** no workspace exists for the current scope and season, **When** the user opens Import data, **Then** they see a prominent action to create the first planning workspace near the top of the page and source actions are unavailable until a workspace exists.
2. **Given** exactly one workspace exists for the current scope and season, **When** the user opens Import data, **Then** that workspace is selected automatically.
3. **Given** multiple workspaces exist for the current scope and season, **When** the user opens Import data, **Then** they can choose the active workspace from a selector near the page context.
4. **Given** a workspace is selected, **When** the user adds, parses, validates, or reviews sources, **Then** those actions affect sources owned by the selected workspace.

---

### User Story 3 - Complete the first import without hunting (Priority: P2)

A raster planner can complete the first import flow from top to bottom without scrolling to hidden advanced controls or losing track of the newly added source.

**Why this priority**: The current flow places source creation at the bottom while newly added sources appear at the top, making users think nothing happened.

**Independent Test**: Can be tested by adding a source from the visible add-source area and confirming the new source and next action are immediately visible.

**Acceptance Scenarios**:

1. **Given** the user wants to add a click-TT URL, **When** they open Import data, **Then** the URL action is available in the primary add-source area without opening a bottom-of-page advanced section.
2. **Given** the user saves a new source, **When** the save completes, **Then** the user can immediately see the saved source and a prominent Parse action.
3. **Given** a source has not been parsed, **When** the user views the source, **Then** the page clearly shows that it still needs parsing.
4. **Given** a source is parsed, **When** the user views the source, **Then** the page clearly summarizes what was parsed.

---

### User Story 4 - Support alternate planning versions (Priority: P3)

A raster planner can create a second planning workspace for the same scope and season when they intentionally want a separate version or scenario.

**Why this priority**: Multiple input sets remain valuable, but creation of additional versions should be deliberate rather than required for first import.

**Independent Test**: Can be tested by creating a second workspace for the same scope and season, switching between workspaces, and confirming the active workspace changes.

**Acceptance Scenarios**:

1. **Given** one workspace already exists, **When** the user chooses to create another workspace, **Then** they provide a user-visible name and can make it the active workspace.
2. **Given** multiple workspaces exist, **When** the user switches the active workspace, **Then** source, validation, and review context update to the selected workspace.
3. **Given** a user is working in one workspace, **When** another workspace exists, **Then** the page prevents accidental edits to the wrong workspace by keeping the active workspace visible.

### Edge Cases

- A user opens Import data for a scope/season with no workspace and legacy sources that are not owned by a workspace.
- A user tries to add a source while no workspace exists; the page directs them to create the first workspace before source actions become available.
- A user has exactly one workspace and later creates a second workspace.
- A user adds an invalid click-TT URL.
- A user uploads PDFs for the wrong scope in their head while the page context shows another scope.
- A source fails to parse after being saved.
- A user changes scope or season while a workspace selector is active.
- A user lacks permission to create workspaces or sources.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The import page MUST display the current scope and season as the primary page context.
- **FR-002**: Source add actions MUST default to the current page scope and season.
- **FR-003**: Users MUST NOT be required to choose a scope inside the normal click-TT URL or wish PDF add flow when a page scope is already active.
- **FR-003a**: Normal source forms MUST NOT include a scope picker.
- **FR-004**: The current season MUST be visible near source add actions before the user submits data.
- **FR-005**: The import page MUST present input sets as planning workspaces.
- **FR-006**: The import page MUST provide a prominent first-workspace creation action when no workspace exists for the current scope and season.
- **FR-006a**: Source add actions MUST be unavailable until a planning workspace exists and is selected.
- **FR-007**: The import page MUST automatically select the only workspace when exactly one workspace exists for the current scope and season.
- **FR-007a**: Changing scope or season MUST reset the workspace selection and re-apply the auto-select rule (none → prompt to create, one → auto-select, many → selector) for the new context.
- **FR-008**: The import page MUST provide a workspace selector when multiple workspaces exist for the current scope and season.
- **FR-008a**: The selected workspace MUST be reflected in the page URL (a query parameter, as scope and season are), so it survives refresh and is shareable.
- **FR-009**: Source add, parse, validate, and review actions MUST clearly apply to the selected workspace.
- **FR-009a**: Sources added through the normal import flow MUST belong to the selected planning workspace by default.
- **FR-009b**: Existing sources that belong to no workspace (created before this feature) MUST be adopted into the first workspace **selected** for their scope and season — whether it is created, auto-selected, or first chosen from the selector — so no source is left unowned. This MUST hold even when the scope and season already have several workspaces (no create or auto-select event occurs); otherwise legacy sources, hidden by the workspace filter, would disappear from view.
- **FR-010**: Users MUST be able to create an additional workspace for the same scope and season after one already exists.
- **FR-010a**: Creating a workspace MUST require only a user-visible workspace name.
- **FR-010b**: The first workspace name SHOULD default to the current scope and season.
- **FR-010c**: Workspace names MUST be unique within the same scope and season, so the selector cannot show indistinguishable planning workspaces.
- **FR-011**: The primary click-TT URL add action MUST be visible in the main import flow, not hidden behind a bottom-of-page advanced section.
- **FR-012**: After a source is saved, the page MUST show the saved source and its next required action without making the user search the page.
- **FR-012a**: Saving a source MUST NOT automatically parse it in the default flow.
- **FR-012b**: Newly saved unparsed sources MUST present Parse as the prominent next action.
- **FR-012c**: Source parsing MUST be explicit and consistent across source types, with a Parse all action for the selected workspace.
- **FR-012d**: Registering a click-TT URL MUST allow the display name to be omitted and use the visible default name.
- **FR-013**: The source list MUST distinguish saved-but-unparsed sources from parsed sources.
- **FR-014**: Parsed sources MUST show a concise summary of imported content.
- **FR-015**: Parse failures MUST leave the saved source visible and show a recoverable error message.
- **FR-016**: Permission-limited users MUST see only actions they are allowed to perform. Creating a workspace and adding, parsing, or validating sources require feature 007's scheduler access (`PLATFORM_ADMIN`, or `SCOPE_ADMIN` holding the scope); a `SCOPE_USER` sees a read-only view without create/add actions. Enforced at the API, not only hidden in the UI.
- **FR-017**: The system MUST support deliberate creation of multiple workspaces for the same scope and season.
- **FR-018**: Inferring gym capacities from a workspace MUST first sync the selected workspace's parsed sources and MUST raise stale inferred capacity rows while preserving reviewed/manual rows.
- **FR-019**: Manual review choices, including team-to-wish PDF matches and A/B week preferences, MUST survive validation, optimizer run startup, and any parsed-source cache sync for the same workspace, as long as any referenced matched wish still exists.
- **FR-020**: Gym-capacity club mapping review MUST surface every unresolved capacity-relevant season-model club whose club id is not already linked to a wish-import club id. A unique strong match MAY be preselected, but lack of a unique match MUST still produce a manual review row with an empty searchable target selector. The review MUST NOT rely on a finite list of known spelling variants, and MUST NOT hide unresolved clubs merely because their teams are currently marked `capacityRelevant: false`; only groups explicitly marked `exclude` may suppress their teams from this mapping review.

### Key Entities *(include if feature involves data)*

- **Scope**: The organizational context selected by the user, such as OWL.
- **Season**: The competition season selected by the user, such as 2026/27.
- **Planning Workspace**: A named planning version for a scope and season. Existing input sets are presented to users as planning workspaces. A workspace requires only a user-visible name.
- **Source**: Imported or registered raw material, such as a click-TT group URL or wish PDF, owned by the selected planning workspace by default.
- **Parsed Source**: A source after extraction has succeeded, including a summary of imported assignments, clubs, teams, or wishes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time planner can add a click-TT URL for the current scope and season in under 60 seconds without selecting scope more than once.
- **SC-002**: At least 90% of test users correctly identify which scope, season, and workspace a new source will affect before saving it.
- **SC-003**: At least 90% of test users can find and parse a newly added source without scrolling away and back.
- **SC-004**: A user with one existing workspace reaches source upload actions with no workspace decision required.
- **SC-005**: A user with multiple workspaces can switch the active workspace and correctly identify the active workspace within 10 seconds.
- **SC-006**: Support questions about "why did saving a URL do nothing?" are reduced by at least 50% during demo/test sessions.

## Assumptions

- The current navigation already determines a scope and season for Raster pages.
- Existing input sets remain the underlying planning-version concept, but users see them as planning workspaces.
- The normal import flow optimizes for the common case: one scope, one season, one active workspace.
- Advanced source placement under a parent or shared scope is out of scope for this UX pass.
- This feature improves the existing one-source-at-a-time model and does not require whole-WTTV scraping.
