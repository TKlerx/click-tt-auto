output "resource_group_name" {
  description = "Bootstrap resource group name."
  value       = azurerm_resource_group.bootstrap.name
}

output "state_storage_account_name" {
  description = "Storage account that holds OpenTofu state."
  value       = azurerm_storage_account.state.name
}

output "state_container_name" {
  description = "Blob container that holds OpenTofu state files."
  value       = azurerm_storage_container.state.name
}

output "state_key_prefix" {
  description = "State key prefix for per-environment main configuration state."
  value       = "app"
}

output "deployment_identity_client_id" {
  description = "Entra application client id used by GitHub Actions OIDC."
  value       = azuread_application.deployment.client_id
}

output "deployment_identity_object_id" {
  description = "Service principal object id used for Azure RBAC."
  value       = azuread_service_principal.deployment.object_id
}

output "runtime_identity_ids" {
  description = "User-assigned managed identity resource ids by environment."
  value       = { for env, identity in azurerm_user_assigned_identity.runtime : env => identity.id }
}

output "runtime_identity_client_ids" {
  description = "User-assigned managed identity client ids by environment."
  value       = { for env, identity in azurerm_user_assigned_identity.runtime : env => identity.client_id }
}

output "runtime_identity_principal_ids" {
  description = "User-assigned managed identity principal ids by environment."
  value       = { for env, identity in azurerm_user_assigned_identity.runtime : env => identity.principal_id }
}

output "registry_name" {
  description = "Shared Azure Container Registry name."
  value       = azurerm_container_registry.shared.name
}

output "registry_id" {
  description = "Shared Azure Container Registry resource id."
  value       = azurerm_container_registry.shared.id
}

output "registry_login_server" {
  description = "Shared Azure Container Registry login server."
  value       = azurerm_container_registry.shared.login_server
}
