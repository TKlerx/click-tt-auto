---
description: "Task list for OpenTofu Azure Infrastructure"
---

# Tasks: OpenTofu Azure Infrastructure

**Input**: Design documents from `/specs/018-opentofu-azure-infra/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Required Context**: Review `/CONTINUE.md` before task execution and update `CONTINUE.md` plus `CONTINUE_LOG.md` when project state materially changes.

**Tests**: This feature is infrastructure-as-code. "Tests" are `tofu fmt -check`, `tofu validate`, `tofu plan` coverage assertions, and documented staged-apply smokes (Constitution II, adapted). They are included per story.

**Organization**: Tasks are grouped by user story (spec.md priorities) so each can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths are relative to repository root; infra lives under `infra/azure/`

## Path Conventions

Infrastructure-as-code module set, additive to the existing app. Root config: `infra/azure/`. Bootstrap: `infra/azure/bootstrap/`. Modules: `infra/azure/modules/<name>/`. Per-environment inputs: `infra/azure/environments/<env>.tfvars`. Deploy workflow: `.github/workflows/deploy-azure.yml`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding and shared configuration

- [x] T001 Create `infra/azure/` structure: root files placeholder, `bootstrap/`, `environments/`, and `modules/{network,data,registry,secrets,observability,runtime}/` directories
- [x] T002 [P] Create `infra/azure/providers.tf` pinning `required_version >= 1.8`, `hashicorp/azurerm ~> 4.x`, `hashicorp/azuread`, `hashicorp/random`
- [x] T003 [P] Create `infra/azure/variables.tf` implementing the input contract in `specs/018-opentofu-azure-infra/contracts/variables-contract.md` (required + optional vars + `validation` blocks for `environment` and image tags)
- [x] T004 [P] Create `infra/azure/locals.tf` with naming (`<project>-<environment>`), standard tags (`environment`, `project`, `managed-by=opentofu`), and a deterministic `name_suffix` via `random_string` for globally-unique names (Azure length-limit edge case)
- [x] T005 [P] Create `infra/azure/README.md` pointing to `quickstart.md` and the contracts
- [x] T006 Add `tofu fmt -check` and `tofu validate` (infra/azure + bootstrap) to the validation workflow (`validate.ps1` / `.github/workflows/validate.yml`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Remote state, deploy identity, and shared network — required before ANY environment can be provisioned

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Create `infra/azure/bootstrap/main.tf` + `variables.tf`: state resource group + Storage Account + blob container (`tfstate`), with `prevent_destroy` lifecycle (clarify Q1; data-model State Store)
- [x] T008 Add to bootstrap: `azuread_application` + federated credential (GitHub OIDC, repo + environment scoped) + subscription/RG role assignments (Contributor, AcrPush, Key Vault Secrets Officer), a user-assigned managed identity for runtimes, and the **single shared Azure Container Registry** (Premium, public access disabled) used by all environments (data-model Deployment Identity + Registry; FR-015, FR-010, SC-007)
- [x] T009 Create `infra/azure/bootstrap/outputs.tf`: state account/container names, deploy client id, runtime MI ids, and shared ACR login server + id
- [x] T010 Create `infra/azure/backend.tf`: `azurerm` backend using bootstrap outputs, per-environment `key = app/<environment>.tfstate`, `use_oidc = true`
- [x] T011 Create `infra/azure/main.tf` root composition skeleton: provider config + one resource group per environment from locals
- [x] T012 Create `modules/network` (VNet + delegated subnet for Container Apps + private DNS zone for PostgreSQL); wire into root `main.tf` (clarify Q2; data-model Network)

**Checkpoint**: State, identity, and network ready — user stories can begin

---

## Phase 3: User Story 1 - Provision A Complete Azure Runtime (Priority: P1) 🎯 MVP

**Goal**: A single `tofu apply` provisions app, worker, migration, PostgreSQL, registry, secret store, monitoring, and identities for an empty resource group, emitting all operator outputs.

**Independent Test**: `tofu plan -var-file=environments/dev.tfvars` for an empty RG shows resources for app runtime, worker runtime, migration execution, PostgreSQL, registry, secrets, monitoring, and identities (SC-002), plus required outputs.

### Tests for User Story 1

- [x] T013 [P] [US1] Create `scripts/infra-plan-check.mjs`: run `tofu plan -out=tfplan` then `tofu show -json tfplan`, assert the plan includes app, worker, migration Job, PostgreSQL, Key Vault, Log Analytics/App Insights, and identities (shared ACR verified via bootstrap), exit non-zero on any missing type (SC-002)

### Implementation for User Story 1

- [x] T014 [P] [US1] Create `modules/data`: PostgreSQL Flexible Server (VNet-only, `public_network_access=false`), application database, distinct app/worker/migration roles, burstable SKU default, `prevent_destroy` (data-model Database; FR-007, FR-021, FR-013)
- [x] T015 [P] [US1] Grant the environment's runtime MI `AcrPull` on the shared bootstrap ACR and wire the app/worker image references (login server from bootstrap output) into the runtime module (data-model Registry; FR-010, FR-021)
- [x] T016 [P] [US1] Create `modules/secrets`: Key Vault with RBAC for runtime MI (read), deploy/provisioning identity (write), and private endpoint for runtime access (data-model Secret; FR-008)
- [x] T017 [P] [US1] Create `modules/observability`: Log Analytics workspace + Application Insights, `prevent_destroy` (data-model Observability; FR-012)
- [x] T018 [US1] Create `modules/runtime/environment.tf`: Container Apps Environment (**workload-profiles type with a single Consumption profile**), VNet-integrated on the subnet so egress reaches the private endpoints (depends on T012)
- [x] T019 [US1] Create `modules/runtime/app.tf`: app Container App, external ingress, app image ref, env (`BASE_PATH`, `AUTH_BASE_URL`), runtime MI, scale 0→`app_max_replicas` (Constitution VIII; clarify Q5)
- [x] T020 [US1] Create `modules/runtime/worker.tf`: worker Container App, no ingress, worker image ref, `worker_min_replicas` default 1
- [x] T021 [US1] Create `modules/runtime/job.tf`: migration Container Apps Job, app image, run-to-completion (`restart=Never`) (FR-005)
- [x] T022 [US1] Wire all modules in root `infra/azure/main.tf` (network → data/registry/secrets/observability/runtime)
- [x] T023 [US1] Create `infra/azure/outputs.tf` per `contracts/outputs-contract.md` (FR-011)
- [x] T024 [US1] Create `infra/azure/environments/dev.tfvars` with dev inputs

**Checkpoint**: US1 done — a full environment can be planned/applied and exposes the app endpoint + operator outputs (MVP)

---

## Phase 4: User Story 2 - Deploy App, Worker, And Migrations Safely (Priority: P1)

**Goal**: A GitHub Actions pipeline deploys explicit image tags, runs migrations first, and promotes app/worker only on migration success — via OIDC, no long-lived credentials.

**Independent Test**: A staged/dry-run deploy with known tags runs the migration step before app/worker promotion; a forced migration failure blocks promotion and reports the failure (SC-003, SC-004).

### Tests for User Story 2

- [x] T025 [P] [US2] Add a deploy-ordering check asserting contract guarantees G1 (migrate-before-promote) and G2 (failed migration blocks promotion) from `contracts/deploy-workflow-contract.md` — `tests/infra/deploy-order.md` or a workflow dry-run job

### Implementation for User Story 2

- [x] T026 [US2] Create `.github/workflows/deploy-azure.yml`: OIDC login (`permissions: id-token: write`), inputs `environment`/`app_image_tag`/`worker_image_tag`/optional `migration_image_tag` (FR-015)
- [x] T027 [US2] Add validate step: required inputs, environment-name validity, and image tag presence in ACR before any promotion (FR-017)
- [x] T028 [US2] Add provision step: `tofu init` (OIDC backend) → `plan` → `apply` for the selected environment, then reserve requested image tags for the post-migration promotion step so Terraform does not route traffic before the gate
- [x] T029 [US2] Add migrate step: trigger the migration Container Apps Job with `migration_image_tag` and wait for completion (FR-005)
- [x] T030 [US2] Add gate + report: on success promote app + worker revisions; on migration failure do NOT promote, fail the run, surface the failure reason, emit deployed revision ids (FR-004, FR-006)

**Checkpoint**: US1 + US2 work — safe, repeatable deploys with migration gating

---

## Phase 5: User Story 3 - Manage Secrets And Runtime Configuration (Priority: P2)

**Goal**: Each runtime receives only its required secrets from Key Vault; optional integrations are not forced.

**Independent Test**: Inspect runtime bindings — app runtime exposes zero undocumented worker-only/migration-only secrets (SC-005); each secret has owner + target runtime.

### Tests for User Story 3

- [x] T031 [P] [US3] Add a secret-exposure check asserting the app runtime references no worker-only or migration-only secrets (SC-005) — `tests/infra/secret-exposure.md` or plan-inspection script

### Implementation for User Story 3

- [x] T032 [US3] In `modules/secrets`: define Key Vault secrets `app-database-url`, `worker-database-url`, `migration-database-url`, `betterauth-secret`, and optional mail/Teams secrets gated by `enable_mail`/`enable_teams` (edge case: unused integrations not required)
- [x] T033 [US3] In `modules/runtime`: bind per-runtime Key Vault secret references via MI — app gets the app set, worker the worker set, migration Job gets `migration-database-url` plus documented admin/app/worker DB URL role-bootstrap exceptions required by `scripts/postgres-provision-roles.mjs` (FR-007, FR-009)
- [x] T034 [US3] Document intentionally shared secrets and any exceptions in `infra/azure/README.md` (FR-009)

**Checkpoint**: Least-privilege secret exposure enforced and documented

---

## Phase 6: User Story 4 - Observe And Operate The Deployment (Priority: P2)

**Goal**: App logs, worker logs, migration/job results, and revision health are discoverable from the provisioned observability resources without exec-ing into containers.

**Independent Test**: Deploy a smoke env, trigger an app request and a worker job event, confirm logs + health + deployment status are findable within 5 minutes (SC-006).

### Tests for User Story 4

- [x] T035 [P] [US4] Add an observability smoke checklist asserting app logs, worker logs, migration Job result, and revision health are queryable in Log Analytics (SC-006) — `tests/infra/observability-smoke.md`

### Implementation for User Story 4

- [x] T036 [US4] In `modules/runtime/environment.tf`: set the Container Apps Environment log destination to the Log Analytics workspace
- [x] T037 [US4] Add diagnostic settings for app/worker metrics and wire Application Insights connection into the app container env (FR-012)
- [x] T038 [US4] Ensure `outputs.tf` surfaces `log_analytics_workspace_id` and the `sensitive` `app_insights_connection_string` (FR-011)

**Checkpoint**: Operational visibility for app, worker, and migration

---

## Phase 7: User Story 5 - Support Multiple Environments (Priority: P3)

**Goal**: Isolated dev/staging/prod from consistent inputs, with no accidental cross-environment sharing and guarded teardown of persistent data.

**Independent Test**: Plan two environments with different names — resources, databases, secrets, identities, and endpoints do not collide (SC-007); a production-secret-in-non-prod attempt is reported; teardown identifies persistent data needing explicit confirmation.

### Tests for User Story 5

- [x] T039 [P] [US5] Create `scripts/infra-env-isolation.mjs`: plan `dev` and `staging` as JSON, assert no shared resource/database/secret/endpoint names except explicitly shared bootstrap resources (state account, shared ACR) (SC-007)

### Implementation for User Story 5

- [x] T040 [P] [US5] Create `infra/azure/environments/staging.tfvars`
- [x] T041 [P] [US5] Create `infra/azure/environments/prod.tfvars` (sized-up `postgres_sku`, replica limits)
- [x] T042 [US5] Add environment-name validation + a guard rejecting production secrets in non-production environments (US5 scenario 2)
- [x] T043 [US5] Add `allow_destroy_persistent` handling so `prevent_destroy` overrides are explicit and opt-in; document teardown order in `quickstart.md` (FR-013, US5 scenario 3)

**Checkpoint**: All five stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T044 [P] Finalize `infra/azure/README.md` linking contracts, variables, outputs, and quickstart
- [x] T045 [P] Update `CONTINUE.md`, `CONTINUE_LOG.md`, and `ACTIVE_SPECS.md` to reflect implementation progress/completion
- [x] T046 Run `quickstart.md` end-to-end against a throwaway environment and record evidence, including `tofu plan` wall-clock (SC-001 < 15 min) and confirmation that bootstrap ordering matches quickstart (FR-014) — live staging apply and migration evidence recorded in `quickstart-evidence.md`
- [x] T047 Confirm `pnpm run dev` and Docker Compose still work with no Azure credentials (FR-018, SC-008)
- [x] T048 Ensure `tofu fmt -check` + `tofu validate` pass for the full `infra/azure` tree in CI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational
  - US1 (P1) is the MVP and should land first
  - US2 (P1) depends on US1 resources existing (migration Job, app/worker apps, ACR) to deploy against
  - US3 (P2) refines US1's Key Vault + runtime bindings
  - US4 (P2) refines US1's observability + runtime wiring
  - US5 (P3) generalizes US1 across environments
- **Polish (Phase 8)**: After desired stories complete

### User Story Dependencies

- US1: after Foundational — no story dependencies
- US2: after US1 (needs the runtime + Job + registry to deploy to)
- US3: after Foundational; integrates with US1 (independently testable via plan inspection)
- US4: after Foundational; integrates with US1 (independently testable via smoke)
- US5: after US1 (reuses the module set across env tfvars)

### Within Each User Story

- Validation/tests defined alongside; assert before/after apply as noted
- Modules (data/registry/secrets/observability) before runtime wiring
- Runtime environment before app/worker/job
- Outputs after resources

### Parallel Opportunities

- Setup: T002, T003, T004, T005 in parallel
- US1: T014, T015, T016, T017 (separate modules) in parallel; then T018 → T019/T020/T021
- US5: T040, T041 in parallel
- Test/check tasks (T013, T025, T031, T035, T039) are [P] within their stories

---

## Parallel Example: User Story 1

```bash
# Launch the independent resource modules together:
Task: "Create modules/data (PostgreSQL Flexible Server)"
Task: "Create modules/secrets (Key Vault)"
Task: "Create modules/observability (Log Analytics + App Insights)"
Task: "Grant runtime MI AcrPull on the shared bootstrap ACR + wire image refs"
# Then runtime: environment before app/worker/job
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (bootstrap state + OIDC identity + network) — CRITICAL
3. Phase 3 US1 — provision a complete environment
4. **STOP and VALIDATE**: `tofu plan` coverage (SC-002), apply to a dev RG, hit the app endpoint
5. Demo

### Incremental Delivery

1. Setup + Foundational → ready
2. US1 → provision (MVP)
3. US2 → safe deploy pipeline
4. US3 → least-privilege secrets
5. US4 → observability
6. US5 → multi-environment
7. Each story adds value without breaking prior ones

---

## Notes

- [P] = different files, no dependencies
- IaC "tests" = `tofu fmt -check`, `tofu validate`, `tofu plan` coverage assertions, and documented staged-apply smokes (no live `apply` in the CI gate)
- Never commit secrets; Key Vault is the source of truth (FR-008)
- Keep local dev + Docker Compose untouched and credential-free (FR-018)
- Commit after each task or logical group; update continuity files on material change
