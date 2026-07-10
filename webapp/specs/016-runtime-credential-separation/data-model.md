# Data Model: Runtime Credential Separation

## Runtime Credential

Represents a sensitive or operationally significant setting made available to one or more runtime contexts.

Fields:

- `name`: Environment variable or setting name.
- `owner`: App, worker, migration/provisioning, local development, or shared exception.
- `requiredIn`: Environments or flows where the value is required.
- `sensitivity`: Secret, connection string, operational setting, or non-secret.
- `purpose`: Short explanation of why the runtime needs it.
- `fallback`: Legacy or local fallback behavior, if any.
- `exceptionId`: Optional link to a credential exception.

## Runtime Context

Represents a process or operator context that receives credentials.

Contexts:

- `app`: Next.js runtime serving UI and API routes.
- `worker`: Python background worker.
- `migration`: Prisma migration and seed flow.
- `local-development`: Developer workstation flow.

## Credential Exception

Represents an approved reason for sharing a credential across runtime boundaries.

Fields:

- `id`: Stable exception identifier.
- `settings`: Credential names covered by the exception.
- `owner`: Person or team responsible for review.
- `rationale`: Why sharing remains acceptable.
- `compensatingControl`: Boundary or process that reduces the risk.
- `reviewDate`: Date when the exception should be rechecked.
- `status`: Proposed, accepted, expired, or removed.

## Runtime Credential Contract

The reviewable table that maps settings to contexts and exceptions.

Relationships:

- Contains many runtime credentials.
- References zero or more credential exceptions.
- Drives validation rules and documentation examples.
