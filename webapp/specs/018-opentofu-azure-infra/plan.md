# Implementation Plan: OpenTofu Azure Infrastructure

**Branch**: `018-opentofu-azure-infra` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-opentofu-azure-infra/spec.md`

**Required First Step**: Read `/CONTINUE.md` before planning or implementation so the current handoff context, open risks, and recommended next actions are carried forward.

## Summary

Provide repeatable OpenTofu (Terraform-compatible) infrastructure-as-code that provisions a complete Azure runtime for this template's three containers (Next.js app, Python worker, one-shot migration) plus managed PostgreSQL, container registry, secret storage, and monitoring. Deployment runs database migrations before promoting new app/worker revisions, keeps app/worker/migration database access paths separate, and is driven from GitHub Actions using OIDC federated identity (no long-lived cloud credentials).

Per the clarifications, the technical approach is:

- **Runtime**: Azure Container Apps **workload-profiles environment (single Consumption profile)**, VNet-integrated on a shared/delegated subnet. App = external ingress; worker = no ingress (internal); migration = Container Apps **Job** (one-shot, gates promotion). The workload-profiles environment keeps consumption billing/scale-to-zero while supporting VNet reach to private endpoints.
- **Database**: Azure Database for PostgreSQL Flexible Server, VNet-only reachability.
- **Registry**: A single shared Azure Container Registry provisioned in `bootstrap/`, VNet-only pull via each environment's managed identity (same image tag promoted across environments).
- **Secrets**: Azure Key Vault as central source of truth; Container Apps reference secrets via managed identity.
- **State**: Azure Storage Account backend with blob lease locking, created by a bootstrap step before main provisioning.
- **Environments**: One resource group per environment (dev/staging/prod) in a single subscription.
- **TLS/domain**: Default Container Apps FQDN + platform TLS for MVP; custom domain is later customization (FR-016).

## Technical Context

**Language/Version**: OpenTofu >= 1.8 (Terraform-compatible HCL); `azurerm` provider ~> 4.x  
**Primary Dependencies**: `hashicorp/azurerm`, `hashicorp/azuread` (federated identity / app registration), optional `hashicorp/random` for unique suffixes  
**Storage**: Azure Storage Account (OpenTofu remote state, blob lease locking); Azure Database for PostgreSQL Flexible Server (application data)  
**Testing**: `tofu validate` + `tofu plan` against per-environment variable files; `tofu fmt -check`; example/dev environment plan smoke in CI. No live `apply` in CI gate.  
**Target Platform**: Azure (Container Apps workload-profiles environment / Consumption profile, PostgreSQL Flexible Server, Container Registry, Key Vault, Log Analytics/Application Insights), driven from GitHub Actions runners  
**Project Type**: Infrastructure-as-code module set (additive to existing web app; does not change app runtime code)  
**Performance Goals**: Operator can generate a plan for a new environment in < 15 min (SC-001); locate app/worker/migration logs + revision health within 5 min (SC-006)  
**Constraints**: No secrets in source control (FR-008); destructive data operations opt-in (FR-013); local dev + Docker Compose unaffected and require no Azure credentials (FR-018, SC-008); small internal-app cost profile (Consumption profile, scale-to-zero where possible)  
**Scale/Scope**: Small internal apps (~10 users, single instance per environment per constitution Technology Constraints); 3 environments (dev/staging/prod), 1 subscription

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status         | Notes                                                                                                                                                                                                                                            |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Simplicity First             | PASS           | Single flat OpenTofu module per environment via `.tfvars`; no premature multi-module abstraction. Consumption profile, public-FQDN-only TLS, RG-per-env are the simplest viable choices. Any added abstraction justified in Complexity Tracking. |
| II. Test Coverage               | PASS (adapted) | IaC "tests" = `tofu validate` + `tofu plan` + `tofu fmt -check` in CI, plus a documented staged-apply smoke. Task generation MUST include these validation tasks. No app unit tests affected.                                                    |
| III. Duplication Control        | PASS           | Shared values (names, tags, region) centralized in locals/variables; per-environment differences isolated to `.tfvars`. No copy-paste per environment.                                                                                           |
| IV. Incremental Delivery        | PASS           | User stories P1→P3. US1 (provision runtime) is the MVP and is independently testable before US2+ (deploy pipeline, secrets, observability, multi-env).                                                                                           |
| V. Spec Sequencing              | PASS           | Older spec 017 closed (last finding remediated 2026-06-05); 018 is the sole active spec. Confirmation recorded in chat + `ACTIVE_SPECS.md`.                                                                                                      |
| VI. Continuity & Handoff        | PASS           | `CONTINUE.md` / `CONTINUE_LOG.md` / `ACTIVE_SPECS.md` updated as part of this work.                                                                                                                                                              |
| VII. Azure OpenAI               | N/A            | No LLM functionality in this feature. (Key Vault makes it easy to add Azure OpenAI secrets later.)                                                                                                                                               |
| VIII. Web Application Standards | PASS           | Base path preserved: infra passes `BASE_PATH` / `AUTH_BASE_URL` env to the app container; default FQDN used to build the public origin. No app behavior change.                                                                                  |
| IX. Internationalization        | N/A            | No user-facing UI strings added by infrastructure code.                                                                                                                                                                                          |
| X. Responsive Design            | N/A            | No UI changes.                                                                                                                                                                                                                                   |

**Technology Constraints alignment**: Constitution states "Deployment: Docker with Docker Compose (to be added later)" and "single instance (no horizontal scaling needed)". This feature is the hosted-deployment realization of that intent. Container Apps single-replica / scale-to-zero respects the single-instance, small-team scale guidance. No conflict.

**Gate result**: PASS — no unjustified violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/018-opentofu-azure-infra/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (infra resource/entity model)
├── quickstart.md        # Phase 1 output (operator bootstrap + deploy guide)
├── contracts/           # Phase 1 output (inputs/outputs + deploy workflow contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
infra/
└── azure/
    ├── bootstrap/              # One-time: state Storage Account + OIDC federated identity / app registration + shared ACR
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── environments/
    │   ├── dev.tfvars
    │   ├── staging.tfvars
    │   └── prod.tfvars
    ├── modules/                # Added only if duplication justifies (see Complexity Tracking)
    │   ├── network/            # VNet + delegated subnet + private endpoints
    │   ├── data/               # PostgreSQL Flexible Server (VNet-only)
    │   ├── secrets/            # Key Vault + secret wiring (VNet-only)
    │   ├── observability/      # Log Analytics + Application Insights
    │   └── runtime/            # Container Apps Environment + app/worker + migration Job
    │                           # (shared ACR lives in bootstrap/; runtime is granted AcrPull)
    ├── main.tf                 # Root composition (per-environment apply)
    ├── variables.tf
    ├── outputs.tf              # FR-011 operator outputs
    ├── providers.tf
    ├── backend.tf              # azurerm state backend (from bootstrap outputs)
    └── README.md

scripts/
├── infra-plan-check.mjs        # SC-002 plan coverage assertion (tofu show -json)
└── infra-env-isolation.mjs     # SC-007 cross-environment isolation assertion

.github/workflows/
└── deploy-azure.yml            # FR-015 OIDC deploy: plan → migrate Job → promote app/worker
```

**Structure Decision**: Infrastructure lives under `infra/azure/`, separate from the existing app (`src/`, `worker/`). A `bootstrap/` configuration creates the state backend storage and federated identity _before_ the main per-environment configuration (resolves the chicken-and-egg of remote state + OIDC). The root configuration is applied once per environment using `environments/<env>.tfvars`, with remote state keyed per environment in a shared state Storage Account. Modules are introduced only where they remove real duplication (network, data, registry, secrets, observability, runtime); per Constitution I, if the root config stays simple enough, modules may be collapsed — this is revisited in Phase 1 and tracked below.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation                                                                                      | Why Needed                                                                                                        | Simpler Alternative Rejected Because                                                                                       |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Separate `bootstrap/` configuration                                                            | Remote state and OIDC identity must exist before the main config can use them; cannot self-host their own backend | Single config can't create the storage account it already needs as a backend (chicken-and-egg)                             |
| `modules/` decomposition (network/data/secrets/observability/runtime; shared ACR in bootstrap) | Each is a cohesive resource group reused across 3 environments; isolates blast radius and keeps root readable     | A single flat `main.tf` with ~30+ resources × env duplication would violate Duplication Control (III) and hurt readability |

_Note: The two items above are deliberate, bounded structure — not speculative abstraction. If Phase 1 finds the module split is heavier than the duplication it removes, the runtime/data/secrets modules will be collapsed into the root config and this table updated._
