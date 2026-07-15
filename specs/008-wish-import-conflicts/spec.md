# Feature Specification: Wish Import Conflict Review

**Feature Branch**: `[008-wish-import-conflicts]`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: User description: "When importing new wish PDFs, do not overwrite existing wishes. Whenever existing system data and new PDFs conflict, trigger a user review. New teams may be added, and reviewed teams missing from the latest import should be kept but marked."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Conflicting Wish Imports (Priority: P1)

As a district admin, I want a new wish PDF import to show every contradiction against existing wishes before changing anything, so reviewed or previously stored data is never silently overwritten.

**Why this priority**: This prevents data loss and keeps imports trustworthy.

**Independent Test**: Start with an input set containing an existing wish, import a PDF with a different day, time, hall, week preference, or requested schedule number for the same team, and verify the conflict appears for explicit review while the existing wish remains unchanged.

**Acceptance Scenarios**:

1. **Given** an existing wish for a team, **When** a new PDF import contains a different wish for the same team, **Then** the system keeps the existing wish and creates a review item showing both values.
2. **Given** a conflict review item, **When** the admin chooses "keep existing", **Then** the existing wish remains active and the review item records the decision.
3. **Given** a conflict review item, **When** the admin chooses "use imported", **Then** the imported wish becomes active and the review item records the decision.
4. **Given** a conflict review item, **When** the admin edits the wish manually, **Then** the edited value becomes active and the review item records that a manual value was chosen.

---

### User Story 2 - Import Non-Conflicting New Wishes (Priority: P2)

As a district admin, I want new teams from fresh PDFs to be added without extra ceremony, so imports remain efficient when they do not threaten existing data.

**Why this priority**: New data should not be blocked by the conflict workflow.

**Independent Test**: Import a PDF containing a team that has no existing wish row and verify it is added as an imported, unreviewed wish.

**Acceptance Scenarios**:

1. **Given** a PDF contains a team with no existing wish, **When** the import is processed, **Then** the new wish is added and marked as imported/unreviewed.
2. **Given** a PDF row exactly matches an existing wish, **When** the import is processed, **Then** no duplicate wish and no conflict are created.

---

### User Story 3 - See Wishes Missing From Latest Import (Priority: P3)

As a district admin, I want wishes already in the system but missing from the latest PDFs to stay visible, so I can notice stale or incomplete imports without losing previous work.

**Why this priority**: Missing rows are useful warnings, but they should not block normal conflict review.

**Independent Test**: Start with an existing wish, import PDFs that do not contain that team, and verify the existing wish remains active with a "missing from latest import" status.

**Acceptance Scenarios**:

1. **Given** an existing wish is absent from the latest import, **When** import review is shown, **Then** the wish remains active and is marked as missing from latest import.
2. **Given** a missing-from-import wish, **When** the admin confirms it is still valid, **Then** the missing marker is cleared or recorded as accepted for that import.

### Edge Cases

- Same PDF uploaded more than once: the import review should not create duplicate active wishes or duplicate conflict rows for identical parsed content.
- Same team appears in multiple uploaded PDFs with different wishes: the import review must show the imported contradiction before comparing it to active system data.
- A parsed row cannot be matched confidently to a team: it must appear as an unmatched import row for manual matching, not overwrite a guessed team.
- A PDF parse produces no teams: the import must fail with a clear message and leave existing wishes unchanged.
- An admin leaves conflicts unresolved: validation and optimizer runs must not use unresolved imported changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat every wish PDF import as a proposed change set before applying changes to active wishes.
- **FR-002**: The system MUST NOT overwrite an existing wish when the imported wish differs in day, time, hall, week preference, requested schedule number, team identity, or notes.
- **FR-003**: The system MUST create a conflict review item for every differing existing/imported wish pair.
- **FR-004**: Users MUST be able to resolve each conflict by keeping the existing wish, using the imported wish, or entering a manual value.
- **FR-005**: The system MUST add imported wishes for teams with no existing wish, marked as imported/unreviewed.
- **FR-006**: The system MUST avoid duplicate active wishes when identical imports are uploaded multiple times.
- **FR-007**: The system MUST keep active wishes that are missing from the latest import and mark them as missing from latest import.
- **FR-008**: The system MUST show unresolved conflicts prominently before validation or optimizer runs.
- **FR-009**: Validation MUST block optimizer runs while import conflicts remain unresolved.
- **FR-010**: The system MUST preserve an audit trail of import decisions, including source, previous value, imported value, chosen value, actor, and time.
- **FR-011**: The conflict review UI MUST support filtering to unresolved conflicts, added wishes, missing-from-import wishes, and accepted/no-op matches.
- **FR-012**: The system MUST leave existing active wishes unchanged if an import fails parsing or matching.

### Key Entities *(include if feature involves data)*

- **Wish Import Batch**: A single user-initiated import operation containing one or more wish PDFs and its parsed rows.
- **Imported Wish Row**: A parsed wish candidate from an import batch, including source file, team match status, and parsed fields.
- **Active Wish**: The currently used wish row for planning, validation, and optimizer input.
- **Wish Import Conflict**: A review item linking an active wish and one or more imported rows with differing values.
- **Conflict Decision**: The user's resolution for a conflict: keep existing, use imported, or manual value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In tests with conflicting imports, 100% of existing active wishes remain unchanged until a user resolves the conflict.
- **SC-002**: Users can identify all unresolved import conflicts for an input set in under 30 seconds.
- **SC-003**: Re-uploading the same PDFs creates zero duplicate active wish rows.
- **SC-004**: Validation blocks 100% of optimizer runs attempted with unresolved import conflicts.
- **SC-005**: For a 50-team import with 10 conflicts, an admin can resolve all conflicts without leaving the import review screen.

## Assumptions

- Existing source upload and PDF parsing remain the normal way to bring wish PDFs into the app.
- "Existing wish" means the active wish currently used by validation and optimization, regardless of whether it was previously reviewed.
- Exact-match imports should be treated as no-op matches, not conflicts.
- Missing-from-latest-import warnings are informational unless combined with another validation problem.
