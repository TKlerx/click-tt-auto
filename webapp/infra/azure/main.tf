data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "environment" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.tags

  lifecycle {
    precondition {
      condition     = local.effective_secret_environment == var.environment
      error_message = "secret_environment must match environment so production secrets cannot be planned into non-production deployments."
    }
  }
}

module "network" {
  source = "./modules/network"

  name_prefix                             = local.name_prefix
  resource_group_name                     = azurerm_resource_group.environment.name
  location                                = azurerm_resource_group.environment.location
  vnet_address_space                      = var.vnet_address_space
  container_apps_subnet_address_prefix    = var.container_apps_subnet_address_prefix
  postgres_subnet_address_prefix          = var.postgres_subnet_address_prefix
  private_endpoints_subnet_address_prefix = var.private_endpoints_subnet_address_prefix
  tags                                    = local.tags
}

module "data" {
  source = "./modules/data"

  name_prefix                = local.name_prefix
  name_suffix                = local.name_suffix
  resource_group_name        = azurerm_resource_group.environment.name
  location                   = azurerm_resource_group.environment.location
  delegated_subnet_id        = module.network.postgres_subnet_id
  private_dns_zone_id        = module.network.postgres_private_dns_zone_id
  postgres_sku               = var.postgres_sku
  postgres_storage_gb        = var.postgres_storage_gb
  postgres_availability_zone = var.postgres_availability_zone
  allow_destroy_persistent   = var.allow_destroy_persistent
  tags                       = local.tags
}

module "registry" {
  source = "./modules/registry"

  name_prefix                = local.name_prefix
  resource_group_name        = azurerm_resource_group.environment.name
  location                   = azurerm_resource_group.environment.location
  registry_id                = var.registry_id
  private_endpoint_subnet_id = module.network.private_endpoints_subnet_id
  virtual_network_id         = module.network.virtual_network_id
  tags                       = local.tags
}

module "secrets" {
  source = "./modules/secrets"

  name_prefix                   = local.name_prefix
  name_suffix                   = local.name_suffix
  resource_group_name           = azurerm_resource_group.environment.name
  location                      = azurerm_resource_group.environment.location
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  runtime_identity_principal_id = var.runtime_identity_principal_id
  deployment_identity_object_id = var.deployment_identity_object_id
  private_endpoint_subnet_id    = module.network.private_endpoints_subnet_id
  virtual_network_id            = module.network.virtual_network_id
  key_vault_allowed_ip_rules    = var.key_vault_allowed_ip_rules
  admin_database_url            = module.data.admin_database_url
  app_database_url              = module.data.app_database_url
  worker_database_url           = module.data.worker_database_url
  migration_database_url        = module.data.migration_database_url
  secret_expiration_date        = var.secret_expiration_date
  initial_admin_email           = var.initial_admin_email
  enable_mail                   = var.enable_mail
  mail_provider                 = var.mail_provider
  mail_default_mailbox          = var.mail_default_mailbox
  graph_client_id               = var.graph_client_id
  graph_client_secret           = var.graph_client_secret
  graph_tenant_id               = var.graph_tenant_id
  enable_teams                  = var.enable_teams
  azure_ad_client_id            = var.azure_ad_client_id
  azure_ad_client_secret        = var.azure_ad_client_secret
  azure_ad_tenant_id            = var.azure_ad_tenant_id
  teams_delegated_grant_key     = var.teams_delegated_grant_encryption_key
  tags                          = local.tags
}

module "observability" {
  source = "./modules/observability"

  name_prefix              = local.name_prefix
  resource_group_name      = azurerm_resource_group.environment.name
  location                 = azurerm_resource_group.environment.location
  allow_destroy_persistent = var.allow_destroy_persistent
  tags                     = local.tags
}

module "runtime" {
  source = "./modules/runtime"

  name_prefix                         = local.name_prefix
  resource_group_name                 = azurerm_resource_group.environment.name
  location                            = azurerm_resource_group.environment.location
  container_apps_subnet_id            = module.network.container_apps_subnet_id
  log_analytics_workspace_id          = module.observability.log_analytics_workspace_id
  app_insights_connection_string      = module.observability.app_insights_connection_string
  registry_login_server               = var.registry_login_server
  runtime_identity_id                 = var.runtime_identity_id
  app_image_ref                       = local.app_image_ref
  worker_image_ref                    = local.worker_image_ref
  migration_image_ref                 = local.migration_image_ref
  app_min_replicas                    = var.app_min_replicas
  app_max_replicas                    = var.app_max_replicas
  worker_min_replicas                 = var.worker_min_replicas
  app_environment                     = var.environment
  app_version                         = var.app_version
  app_revision                        = var.app_revision
  app_build_id                        = var.app_build_id
  app_built_at                        = var.app_built_at
  base_path                           = var.base_path
  custom_domain                       = var.custom_domain
  enable_mail                         = var.enable_mail
  enable_teams                        = var.enable_teams
  teams_poll_interval_seconds         = var.teams_poll_interval_seconds
  admin_database_url_secret_id        = module.secrets.admin_database_url_secret_id
  app_database_url_secret_id          = module.secrets.app_database_url_secret_id
  worker_database_url_secret_id       = module.secrets.worker_database_url_secret_id
  migration_database_url_secret_id    = module.secrets.migration_database_url_secret_id
  better_auth_secret_id               = module.secrets.better_auth_secret_id
  initial_admin_email_secret_id       = module.secrets.initial_admin_email_secret_id
  initial_admin_password_secret_id    = module.secrets.initial_admin_password_secret_id
  mail_provider_secret_id             = module.secrets.mail_provider_secret_id
  mail_default_mailbox_secret_id      = module.secrets.mail_default_mailbox_secret_id
  graph_client_id_secret_id           = module.secrets.graph_client_id_secret_id
  graph_client_secret_secret_id       = module.secrets.graph_client_secret_secret_id
  graph_tenant_id_secret_id           = module.secrets.graph_tenant_id_secret_id
  azure_ad_client_id_secret_id        = module.secrets.azure_ad_client_id_secret_id
  azure_ad_client_secret_secret_id    = module.secrets.azure_ad_client_secret_secret_id
  azure_ad_tenant_id_secret_id        = module.secrets.azure_ad_tenant_id_secret_id
  teams_delegated_grant_key_secret_id = module.secrets.teams_delegated_grant_key_secret_id
  tags                                = local.tags

  depends_on = [
    module.registry,
    module.secrets,
  ]
}
