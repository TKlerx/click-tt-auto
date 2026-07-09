output "resource_group_name" {
  description = "Environment resource group name."
  value       = azurerm_resource_group.environment.name
}

output "app_endpoint" {
  description = "Public HTTPS URL of the app including base path."
  value       = module.runtime.app_endpoint
}

output "app_fqdn" {
  description = "Raw Container App FQDN."
  value       = module.runtime.app_fqdn
}

output "registry_login_server" {
  description = "ACR login server for push/pull."
  value       = var.registry_login_server
}

output "registry_name" {
  description = "ACR resource name."
  value       = split(".", var.registry_login_server)[0]
}

output "database_host" {
  description = "PostgreSQL Flexible Server FQDN."
  value       = module.data.database_host
}

output "database_name" {
  description = "Application database name."
  value       = module.data.database_name
}

output "key_vault_uri" {
  description = "Key Vault URI."
  value       = module.secrets.key_vault_uri
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace id."
  value       = module.observability.log_analytics_workspace_id
}

output "app_insights_connection_string" {
  description = "Application Insights connection string."
  value       = module.observability.app_insights_connection_string
  sensitive   = true
}

output "deployment_identity_client_id" {
  description = "GitHub OIDC deployment application client id."
  value       = var.deployment_identity_client_id
}

output "runtime_identity_principal_id" {
  description = "Runtime managed identity principal id."
  value       = var.runtime_identity_principal_id
}

output "migration_job_name" {
  description = "Migration Container Apps Job name."
  value       = module.runtime.migration_job_name
}

output "app_container_app_name" {
  description = "App Container App name."
  value       = module.runtime.app_container_app_name
}

output "worker_container_app_name" {
  description = "Worker Container App name."
  value       = module.runtime.worker_container_app_name
}

output "virtual_network_id" {
  description = "Environment virtual network resource id."
  value       = module.network.virtual_network_id
}

output "container_apps_subnet_id" {
  description = "Delegated subnet resource id for Azure Container Apps."
  value       = module.network.container_apps_subnet_id
}

output "postgres_subnet_id" {
  description = "Delegated subnet resource id for PostgreSQL Flexible Server."
  value       = module.network.postgres_subnet_id
}

output "postgres_private_dns_zone_id" {
  description = "Private DNS zone id for PostgreSQL Flexible Server private access."
  value       = module.network.postgres_private_dns_zone_id
}
