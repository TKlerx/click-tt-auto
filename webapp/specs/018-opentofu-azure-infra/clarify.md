# Clarifications: OpenTofu Azure Infrastructure

**Feature**: `018-opentofu-azure-infra`
**Date**: 2026-06-05

## Session 2026-06-05

- Q: Where should OpenTofu remote state live?  
  A: Azure Storage Account backend with blob lease state locking. A bootstrap configuration creates the state storage account before the main per-environment infrastructure can use it.
- Q: What network posture should the MVP use?  
  A: VNet-integrated Azure Container Apps workload-profiles environment with one Consumption profile. Only the app frontend has public ingress; worker and migration runtimes are internal-only. PostgreSQL, ACR, and Key Vault data planes are reachable only from the VNet.
- Q: How are dev, staging, and production isolated?  
  A: One resource group per environment within a single Azure subscription.
- Q: What is the secret source of truth?  
  A: Azure Key Vault. Container Apps reference Key Vault secrets via managed identity rather than storing independent source-controlled secret values.
- Q: How should custom domain and TLS work for MVP?  
  A: Use the default Azure Container Apps FQDN and platform TLS certificate. Domain/base URL inputs still configure application origins and base-path behavior; custom domain binding is documented as a later customization.
- Q: Which CI/CD target is in scope first?  
  A: GitHub Actions with Azure OIDC federation. Azure DevOps can be documented later but is not required for MVP.
- Q: How should the registry be provisioned?  
  A: A shared Azure Container Registry is created by the bootstrap configuration and reused by environment deployments, with managed identity-based pull permissions.
