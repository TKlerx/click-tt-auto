variable "name_prefix" {
  description = "Environment name prefix used for Azure resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for runtime resources."
  type        = string
}

variable "container_apps_subnet_id" {
  description = "Delegated Container Apps subnet id."
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace id for Container Apps logs."
  type        = string
}

variable "app_insights_connection_string" {
  description = "Application Insights connection string."
  type        = string
  sensitive   = true
}

variable "registry_login_server" {
  description = "ACR login server."
  type        = string
}

variable "runtime_identity_id" {
  description = "User-assigned managed identity resource id."
  type        = string
}

variable "app_image_ref" {
  description = "Full app container image reference."
  type        = string
}

variable "worker_image_ref" {
  description = "Full worker container image reference."
  type        = string
}

variable "migration_image_ref" {
  description = "Full migration container image reference."
  type        = string
}

variable "app_min_replicas" {
  description = "Minimum app replicas."
  type        = number
}

variable "app_max_replicas" {
  description = "Maximum app replicas."
  type        = number
}

variable "worker_min_replicas" {
  description = "Minimum worker replicas."
  type        = number
}

variable "app_environment" {
  description = "Non-secret application environment label."
  type        = string
}

variable "app_version" {
  description = "Non-secret application version label."
  type        = string
}

variable "app_revision" {
  description = "Non-secret source revision."
  type        = string
}

variable "app_build_id" {
  description = "Non-secret CI/build identifier."
  type        = string
}

variable "app_built_at" {
  description = "Non-secret build timestamp."
  type        = string
}

variable "base_path" {
  description = "Application base path."
  type        = string
}

variable "custom_domain" {
  description = "Optional custom domain."
  type        = string
}

variable "enable_mail" {
  description = "Whether mail integration is enabled."
  type        = bool
}

variable "enable_teams" {
  description = "Whether Teams integration is enabled."
  type        = bool
}

variable "teams_poll_interval_seconds" {
  description = "Worker Teams polling interval in seconds."
  type        = number
}

variable "admin_database_url_secret_id" {
  description = "Key Vault secret id for admin database URL, scoped to the migration job."
  type        = string
}

variable "app_database_url_secret_id" {
  description = "Key Vault secret id for app database URL."
  type        = string
}

variable "worker_database_url_secret_id" {
  description = "Key Vault secret id for worker database URL."
  type        = string
}

variable "migration_database_url_secret_id" {
  description = "Key Vault secret id for migration database URL."
  type        = string
}

variable "better_auth_secret_id" {
  description = "Key Vault secret id for Better Auth secret."
  type        = string
}

variable "initial_admin_email_secret_id" {
  description = "Key Vault secret id for the initial admin email."
  type        = string
}

variable "initial_admin_password_secret_id" {
  description = "Key Vault secret id for the initial admin password."
  type        = string
}

variable "mail_provider_secret_id" {
  description = "Key Vault secret id for MAIL_PROVIDER when mail is enabled."
  type        = string
  nullable    = true
}

variable "mail_default_mailbox_secret_id" {
  description = "Key Vault secret id for MAIL_DEFAULT_MAILBOX when mail is enabled."
  type        = string
  nullable    = true
}

variable "graph_client_id_secret_id" {
  description = "Key Vault secret id for GRAPH_CLIENT_ID when mail is enabled."
  type        = string
  nullable    = true
}

variable "graph_client_secret_secret_id" {
  description = "Key Vault secret id for GRAPH_CLIENT_SECRET when mail is enabled."
  type        = string
  nullable    = true
}

variable "graph_tenant_id_secret_id" {
  description = "Key Vault secret id for GRAPH_TENANT_ID when mail is enabled."
  type        = string
  nullable    = true
}

variable "azure_ad_client_id_secret_id" {
  description = "Key Vault secret id for AZURE_AD_CLIENT_ID when Teams is enabled."
  type        = string
  nullable    = true
}

variable "azure_ad_client_secret_secret_id" {
  description = "Key Vault secret id for AZURE_AD_CLIENT_SECRET when Teams is enabled."
  type        = string
  nullable    = true
}

variable "azure_ad_tenant_id_secret_id" {
  description = "Key Vault secret id for AZURE_AD_TENANT_ID when Teams is enabled."
  type        = string
  nullable    = true
}

variable "teams_delegated_grant_key_secret_id" {
  description = "Key Vault secret id for TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY when Teams is enabled."
  type        = string
  nullable    = true
}

variable "tags" {
  description = "Tags applied to runtime resources."
  type        = map(string)
}
