# Backlog

## Agent Guidance

- Create a `SKILL.md` that teaches agents how to use this application: project workflow, validation commands, common development paths, and the repo-specific quality gates.

## Auditability

- Add value-level audit metadata for write actions so audit entries can show the field changed and the new value that was set, without requiring a textual diff view.
- Extend `recordAudit()` usage to accept structured change payloads for key entity updates such as campaign fields, event fields, document metadata, collaborator changes, and workflow state changes.
- Persist audit change details in a queryable form that the audit API can return directly to the UI.

## Audit Log UI

- Build an audit log page for campaigns that shows actor, timestamp, action, entity, and the new value(s) set for each recorded change.
- Keep the audit UI explicitly non-diff-based: no side-by-side diffing required, but users should be able to see the resulting value after a change.
- Add lightweight filtering and pagination for the audit log so the value-level history stays usable as campaigns grow.
