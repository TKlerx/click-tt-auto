variable "name_prefix" {
  description = "Environment name prefix used for Azure resource names."
  type        = string
}

variable "name_suffix" {
  description = "Deterministic suffix for globally unique names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for secret resources."
  type        = string
}

variable "tenant_id" {
  description = "Azure tenant id."
  type        = string
}

variable "runtime_identity_principal_id" {
  description = "Runtime managed identity principal id."
  type        = string
}

variable "deployment_identity_object_id" {
  description = "Deployment service principal object id."
  type        = string
}

variable "private_endpoint_subnet_id" {
  description = "Private endpoint subnet resource id."
  type        = string
}

variable "virtual_network_id" {
  description = "Environment virtual network id."
  type        = string
}

variable "key_vault_allowed_ip_rules" {
  description = "Public IPv4/CIDR ranges allowed to access the Key Vault data plane for deployment-time secret writes."
  type        = list(string)
  default     = []
}

variable "admin_database_url" {
  description = "Admin database URL stored in Key Vault for migration job role provisioning only."
  type        = string
  sensitive   = true
}

variable "app_database_url" {
  description = "App database URL stored in Key Vault."
  type        = string
  sensitive   = true
}

variable "worker_database_url" {
  description = "Worker database URL stored in Key Vault."
  type        = string
  sensitive   = true
}

variable "migration_database_url" {
  description = "Migration database URL stored in Key Vault."
  type        = string
  sensitive   = true
}

variable "secret_expiration_date" {
  description = "RFC3339 expiration date applied to generated Key Vault secrets."
  type        = string
}

variable "initial_admin_email" {
  description = "Initial admin email stored in Key Vault."
  type        = string
}

variable "enable_mail" {
  description = "Whether optional mail secrets are created."
  type        = bool
}

variable "mail_provider" {
  description = "Mail provider stored when enable_mail is true."
  type        = string
}

variable "mail_default_mailbox" {
  description = "Default mail mailbox stored when enable_mail is true."
  type        = string
}

variable "graph_client_id" {
  description = "Graph mail client id stored when enable_mail is true."
  type        = string
}

variable "graph_client_secret" {
  description = "Graph mail client secret stored when enable_mail is true."
  type        = string
  sensitive   = true
}

variable "graph_tenant_id" {
  description = "Graph mail tenant id stored when enable_mail is true."
  type        = string
}

variable "enable_teams" {
  description = "Whether optional Teams secrets are created."
  type        = bool
}

variable "azure_ad_client_id" {
  description = "Azure AD client id stored when enable_teams is true."
  type        = string
}

variable "azure_ad_client_secret" {
  description = "Azure AD client secret stored when enable_teams is true."
  type        = string
  sensitive   = true
}

variable "azure_ad_tenant_id" {
  description = "Azure AD tenant id stored when enable_teams is true."
  type        = string
}

variable "teams_delegated_grant_key" {
  description = "Teams delegated grant encryption key stored when enable_teams is true."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags applied to secret resources."
  type        = map(string)
}
