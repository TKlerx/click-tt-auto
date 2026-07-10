# Data Model: Deploy Smoke Verification

## SmokeTarget

Represents the deployment environment selected by the operator.

Fields:

- `environment`: `dev`, `staging`, `prod`, or another explicitly supplied environment label.
- `appEndpoint`: Public application endpoint, including base path when configured.
- `resourceGroup`: Azure resource group containing runtime resources.
- `appName`: Web Container App name.
- `workerName`: Worker Container App name.
- `migrationJobName`: Migration Container Apps Job name.
- `migrationExecutionName`: Optional execution name from the deployment workflow.
- `timeoutSeconds`: Maximum time allowed for health requests and polling.

Validation:

- Required fields must be non-empty.
- `appEndpoint` must be an absolute HTTP or HTTPS URL.
- Timeout must be positive and bounded.

## SmokeCheck

Represents one required verification.

Fields:

- `name`: Stable check identifier.
- `status`: `pass` or `fail`.
- `target`: Sanitized target that was checked.
- `durationMs`: Runtime duration.
- `message`: Human-readable result.
- `details`: Optional sanitized diagnostic fields.

Validation:

- Failed checks must include a message.
- Details must be sanitized before output.

## SmokeReport

Represents the complete smoke verification result.

Fields:

- `environment`: Target environment label.
- `startedAt`: ISO timestamp.
- `finishedAt`: ISO timestamp.
- `status`: `pass` or `fail`.
- `checks`: Ordered list of `SmokeCheck`.

Validation:

- Overall status is `fail` if any required check failed.
- Reports must be serializable as JSON.
- Reports must not include raw secrets or tokens.
