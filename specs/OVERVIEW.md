# click-TT Automation Specs Overview

Last Updated: 2026-07-23

Purpose: Track the status of all planned features, their implementation progress, and next steps.

## Status Legend

| Status | Meaning | Expected Artifacts |
| --- | --- | --- |
| Planned | The feature intent is captured, but no clarification work has been recorded yet. | `spec.md` only |
| Clarified | The open scope and decision questions have been resolved. | `spec.md` + `clarify.md` |
| Analyzed | The feature has been researched enough to support planning. | `spec.md` + `clarify.md` + `research.md` |
| Tasked | The feature has a concrete execution plan and task list, but no implementation tasks are checked yet. | `spec.md` + `clarify.md` + `research.md` + `plan.md` + `data-model.md` + `tasks.md` |
| In Progress | Implementation has started and some tasks are checked. | `tasks.md` exists and some tasks are checked |
| Partially Implemented | Core work appears implemented, but tasks remain unchecked. | Major stories implemented, but tasks remain unchecked |
| Fully Implemented | All tasks are checked and validation/testing is recorded as complete. | All tasks checked and validation/testing noted as complete |

## Specs Summary

| # | Feature | Status | Depends On | Est. Effort | Next Step |
| --- | --- | --- | --- | --- | --- |
| 001 | Match Report Auto-Approval | Partially Implemented | - | Large | Continue implementation and complete the remaining tasks |
| 002 | Rasterzahl Wish Optimizer | Fully Implemented | Why this priority: Every downstream number depends on reading messy PDFs (misaligned tables, free-text notes) correctly. The relational wishes live in free-text "Besondere Wünsche" and must be extracted with human oversight. A wrong model silently invalidates everything. | Large | Review, commit, and propagate the finished feature |
| 003 | Raster Generation & Review Webapp | Fully Implemented | - | Large | Review, commit, and propagate the finished feature |
| 012 | Manual Baseline Rasterzahlen Import | Planned | 002, 011 | Medium | Clarify crawler access path and plan implementation |

## Implementation Roadmap

### Complete

- 002 Rasterzahl Wish Optimizer: fully implemented
- 003 Raster Generation & Review Webapp: fully implemented

### Begin Immediately

- 001 Match Report Auto-Approval: Continue implementation and complete the remaining tasks
- 012 Manual Baseline Rasterzahlen Import: Clarify crawler access path and plan implementation

### Blocked / Prep Needed

- No planned features are blocked on clarify/analyze/planning work
