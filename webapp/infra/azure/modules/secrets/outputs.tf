output "key_vault_id" {
  description = "Key Vault resource id."
  value       = azurerm_key_vault.environment.id
}

output "key_vault_uri" {
  description = "Key Vault URI."
  value       = azurerm_key_vault.environment.vault_uri
}

output "admin_database_url_secret_id" {
  description = "Versionless Key Vault secret id for the admin database URL."
  value       = azurerm_key_vault_secret.runtime["admin-database-url"].versionless_id
}

output "app_database_url_secret_id" {
  description = "Versionless Key Vault secret id for the app database URL."
  value       = azurerm_key_vault_secret.runtime["app-database-url"].versionless_id
}

output "worker_database_url_secret_id" {
  description = "Versionless Key Vault secret id for the worker database URL."
  value       = azurerm_key_vault_secret.runtime["worker-database-url"].versionless_id
}

output "migration_database_url_secret_id" {
  description = "Versionless Key Vault secret id for the migration database URL."
  value       = azurerm_key_vault_secret.runtime["migration-database-url"].versionless_id
}

output "better_auth_secret_id" {
  description = "Versionless Key Vault secret id for Better Auth."
  value       = azurerm_key_vault_secret.runtime["betterauth-secret"].versionless_id
}

output "initial_admin_email_secret_id" {
  description = "Versionless Key Vault secret id for the initial admin email."
  value       = azurerm_key_vault_secret.runtime["initial-admin-email"].versionless_id
}

output "initial_admin_password_secret_id" {
  description = "Versionless Key Vault secret id for the initial admin password."
  value       = azurerm_key_vault_secret.runtime["initial-admin-password"].versionless_id
}

output "mail_provider_secret_id" {
  description = "Versionless Key Vault secret id for MAIL_PROVIDER when mail is enabled."
  value       = try(azurerm_key_vault_secret.runtime["mail-provider"].versionless_id, null)
}

output "mail_default_mailbox_secret_id" {
  description = "Versionless Key Vault secret id for MAIL_DEFAULT_MAILBOX when mail is enabled."
  value       = try(azurerm_key_vault_secret.runtime["mail-default-mailbox"].versionless_id, null)
}

output "graph_client_id_secret_id" {
  description = "Versionless Key Vault secret id for GRAPH_CLIENT_ID when mail is enabled."
  value       = try(azurerm_key_vault_secret.runtime["graph-client-id"].versionless_id, null)
}

output "graph_client_secret_secret_id" {
  description = "Versionless Key Vault secret id for GRAPH_CLIENT_SECRET when mail is enabled."
  value       = try(azurerm_key_vault_secret.runtime["graph-client-secret"].versionless_id, null)
}

output "graph_tenant_id_secret_id" {
  description = "Versionless Key Vault secret id for GRAPH_TENANT_ID when mail is enabled."
  value       = try(azurerm_key_vault_secret.runtime["graph-tenant-id"].versionless_id, null)
}

output "azure_ad_client_id_secret_id" {
  description = "Versionless Key Vault secret id for AZURE_AD_CLIENT_ID when Teams is enabled."
  value       = try(azurerm_key_vault_secret.runtime["azure-ad-client-id"].versionless_id, null)
}

output "azure_ad_client_secret_secret_id" {
  description = "Versionless Key Vault secret id for AZURE_AD_CLIENT_SECRET when Teams is enabled."
  value       = try(azurerm_key_vault_secret.runtime["azure-ad-client-secret"].versionless_id, null)
}

output "azure_ad_tenant_id_secret_id" {
  description = "Versionless Key Vault secret id for AZURE_AD_TENANT_ID when Teams is enabled."
  value       = try(azurerm_key_vault_secret.runtime["azure-ad-tenant-id"].versionless_id, null)
}

output "teams_delegated_grant_key_secret_id" {
  description = "Versionless Key Vault secret id for TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY when Teams is enabled."
  value       = try(azurerm_key_vault_secret.runtime["teams-delegated-grant-encryption-key"].versionless_id, null)
}
