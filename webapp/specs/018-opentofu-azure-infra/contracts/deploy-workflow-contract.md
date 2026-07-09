# Contract: GitHub Actions Deploy Workflow (`deploy-azure.yml`)

Satisfies FR-004, FR-005, FR-006, FR-015, FR-017. Defines the required deployment sequence and its observable guarantees. The exact YAML is implementation; this contract is what any implementation MUST honor.

## Identity

- Authenticates to Azure via **OIDC federated credential** (workload identity federation). No long-lived client secret stored (FR-015).
- `permissions: { id-token: write, contents: read }`.
- The federated credential subject is scoped to the repository and the target GitHub Environment (`dev`/`staging`/`prod`), bounding which run can deploy which Azure environment.

## Inputs

| Input                 | Required | Notes                                              |
| --------------------- | -------- | -------------------------------------------------- |
| `environment`         | yes      | Selects `.tfvars` + state key + GitHub Environment |
| `app_image_tag`       | yes      | Promoted app image                                 |
| `worker_image_tag`    | yes      | Promoted worker image                              |
| `migration_image_tag` | no       | Defaults to `app_image_tag`                        |

## Required sequence (ordering is the contract)

1. **Validate** (FR-017): check required inputs, environment name validity, and that `app_image_tag` / `worker_image_tag` (and migration tag) exist in ACR. Fail fast if missing.
2. **Provision / reconcile**: `tofu init` (OIDC backend) → `tofu plan` → `tofu apply` for the selected environment. The apply reconciles infrastructure and emits resource names; requested app/worker image tags are not promoted here so Terraform cannot route traffic before migration succeeds.
3. **Migrate**: trigger the migration Container Apps **Job** with `migration_image_tag` and wait for completion.
4. **Gate**:
   - If the migration Job **succeeds** → update/promote the new app and worker revisions with the requested image tags.
   - If the migration Job **fails** → do **NOT** promote app/worker; mark the workflow failed; surface the migration failure reason in the run output (FR-006). Existing revisions keep serving.
5. **Report**: emit the deployed revision identifiers and the migration result.

## Guarantees (testable — maps to Success Criteria)

- G1 (SC-003): In every successful run, the migration step completes before app/worker promotion.
- G2 (SC-004): A failing migration prevents promotion and reports the failure in the workflow.
- G3 (FR-007): app / worker / migration receive only their own database access path (distinct Key Vault-backed connection strings).
- G4 (FR-015): no long-lived cloud credential is present in the workflow or repo secrets for Azure auth.

## Non-goals

- Image building is out of scope of this contract (existing build pipeline / `Dockerfile.app` + `Dockerfile.worker` produce and push images). This workflow consumes already-published tags.
