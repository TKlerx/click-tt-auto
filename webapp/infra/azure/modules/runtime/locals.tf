locals {
  default_app_base_url = "https://${var.name_prefix}-app.${azurerm_container_app_environment.environment.default_domain}"
  app_base_url         = length(trimspace(var.custom_domain)) > 0 ? "https://${trimspace(var.custom_domain)}" : local.default_app_base_url
  auth_base_url        = "${local.app_base_url}${var.base_path}"

  app_optional_secret_ids = var.enable_teams ? {
    azure-ad-client-id                   = var.azure_ad_client_id_secret_id
    azure-ad-client-secret               = var.azure_ad_client_secret_secret_id
    azure-ad-tenant-id                   = var.azure_ad_tenant_id_secret_id
    teams-delegated-grant-encryption-key = var.teams_delegated_grant_key_secret_id
  } : {}

  worker_optional_secret_ids = merge(
    var.enable_mail ? {
      mail-provider        = var.mail_provider_secret_id
      mail-default-mailbox = var.mail_default_mailbox_secret_id
      graph-client-id      = var.graph_client_id_secret_id
      graph-client-secret  = var.graph_client_secret_secret_id
      graph-tenant-id      = var.graph_tenant_id_secret_id
    } : {},
    var.enable_teams ? {
      azure-ad-client-id                   = var.azure_ad_client_id_secret_id
      azure-ad-client-secret               = var.azure_ad_client_secret_secret_id
      azure-ad-tenant-id                   = var.azure_ad_tenant_id_secret_id
      teams-delegated-grant-encryption-key = var.teams_delegated_grant_key_secret_id
    } : {},
  )
}
