# Business App Starter Specs Overview

Last Updated: 2026-07-15

Purpose: Track the status of all planned features, their implementation progress, and next steps.

## Status Legend

| Status                | Meaning                                                                                               | Expected Artifacts                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Planned               | The feature intent is captured, but no clarification work has been recorded yet.                      | `spec.md` only                                                                      |
| Clarified             | The open scope and decision questions have been resolved.                                             | `spec.md` with `## Clarifications` section (or `clarify.md`)                        |
| Analyzed              | The feature has been researched enough to support planning.                                           | `spec.md` + `clarify.md` + `research.md`                                            |
| Tasked                | The feature has a concrete execution plan and task list, but no implementation tasks are checked yet. | `spec.md` + `clarify.md` + `research.md` + `plan.md` + `data-model.md` + `tasks.md` |
| In Progress           | Implementation has started and some tasks are checked.                                                | `tasks.md` exists and some tasks are checked                                        |
| Partially Implemented | Core work appears implemented, but tasks remain unchecked.                                            | Major stories implemented, but tasks remain unchecked                               |
| Fully Implemented     | All tasks are checked and validation/testing is recorded as complete.                                 | All tasks checked and validation/testing noted as complete                          |

## Specs Summary

| #   | Feature                       | Status            | Depends On                                                                                   | Est. Effort | Next Step                                          |
| --- | ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------- |
| 010 | Auth Security Hardening       | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 011 | API Route Refactor            | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 012 | Openapi And Pat               | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 013 | Cli Client                    | Fully Implemented | Spec 012 (OpenAPI & Personal Access Tokens) â€” requires PAT auth and CLI browser login flow | Large       | Review, commit, and propagate the finished feature |
| 014 | Shared Mailbox Notifications  | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 015 | Teams Messaging Skeleton      | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 016 | Runtime Credential Separation | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 017 | DeepSec Remediation           | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 018 | OpenTofu Azure Infrastructure | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 019 | Logging Standardization       | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 020 | Deploy Smoke Verification     | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |
| 021 | Ops Health Dashboard          | Fully Implemented | -                                                                                            | Large       | Review, commit, and propagate the finished feature |

## Implementation Roadmap

### Complete

- 010 Auth Security Hardening: fully implemented
- 011 API Route Refactor: fully implemented
- 012 Openapi And Pat: fully implemented
- 013 Cli Client: fully implemented
- 014 Shared Mailbox Notifications: fully implemented
- 015 Teams Messaging Skeleton: fully implemented
- 016 Runtime Credential Separation: fully implemented
- 017 DeepSec Remediation: fully implemented
- 018 OpenTofu Azure Infrastructure: fully implemented
- 019 Logging Standardization: fully implemented
- 020 Deploy Smoke Verification: fully implemented
- 021 Ops Health Dashboard: fully implemented

### Begin Immediately

- No tasked or in-progress numbered features are waiting for implementation work

### Blocked / Prep Needed

- No planned features are blocked on clarify/analyze/planning work
