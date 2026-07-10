data "azurerm_subscription" "current" {}
data "azuread_client_config" "current" {}

resource "random_string" "name_suffix" {
  length  = 6
  lower   = true
  numeric = true
  special = false
  upper   = false

  keepers = {
    project = var.project
  }
}

locals {
  name_prefix = "${var.project}-bootstrap"
  name_suffix = random_string.name_suffix.result

  resource_group_name     = "${local.name_prefix}-rg"
  state_container_name    = "tfstate"
  storage_account_name    = substr(replace("${var.project}${local.name_suffix}tfstate", "-", ""), 0, 24)
  registry_name           = substr(replace("${var.project}${local.name_suffix}acr", "-", ""), 0, 50)
  deployment_display_name = "${var.project}-github-deploy"

  standard_tags = {
    environment = "bootstrap"
    project     = var.project
    managed-by  = "opentofu"
  }

  tags = merge(local.standard_tags, var.tags)
}

resource "azurerm_resource_group" "bootstrap" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_storage_account" "state" { # nosemgrep: terraform.azure.security.storage.storage-queue-services-logging.storage-queue-services-logging -- queue logging is configured by azurerm_storage_account_queue_properties.state for AzureRM v5 compatibility.
  name                            = local.storage_account_name
  resource_group_name             = azurerm_resource_group.bootstrap.name
  location                        = azurerm_resource_group.bootstrap.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true
  tags                            = local.tags

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices", "Logging", "Metrics"]
    ip_rules       = var.state_storage_allowed_ip_rules
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account_queue_properties" "state" {
  storage_account_id = azurerm_storage_account.state.id

  logging {
    delete                = true
    read                  = true
    version               = "1.0"
    write                 = true
    retention_policy_days = 7
  }
}

resource "azurerm_storage_container" "state" {
  name                  = local.state_container_name
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_container_registry" "shared" {
  name                          = local.registry_name
  resource_group_name           = azurerm_resource_group.bootstrap.name
  location                      = azurerm_resource_group.bootstrap.location
  sku                           = "Premium"
  admin_enabled                 = false
  public_network_access_enabled = false
  tags                          = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_user_assigned_identity" "runtime" {
  for_each = var.github_environments

  name                = "${var.project}-${each.key}-runtime-mi"
  resource_group_name = azurerm_resource_group.bootstrap.name
  location            = azurerm_resource_group.bootstrap.location
  tags                = merge(local.tags, { environment = each.key })
}

resource "azuread_application" "deployment" {
  display_name = local.deployment_display_name
  owners       = [data.azuread_client_config.current.object_id]
}

resource "azuread_service_principal" "deployment" {
  client_id = azuread_application.deployment.client_id
  owners    = [data.azuread_client_config.current.object_id]
}

resource "azuread_application_federated_identity_credential" "github_environment" {
  for_each = var.github_environments

  application_id = azuread_application.deployment.id
  display_name   = "github-${each.key}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_owner}/${var.github_repository}:environment:${each.key}"
}

resource "azurerm_role_assignment" "deployment_contributor" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.deployment.object_id
}

resource "azurerm_role_assignment" "deployment_acr_push" {
  scope                = azurerm_container_registry.shared.id
  role_definition_name = "AcrPush"
  principal_id         = azuread_service_principal.deployment.object_id
}

resource "azurerm_role_assignment" "deployment_state" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.deployment.object_id
}

resource "azurerm_role_assignment" "deployment_key_vault_secrets_officer" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = azuread_service_principal.deployment.object_id
}

resource "azurerm_role_assignment" "runtime_acr_pull" {
  for_each = azurerm_user_assigned_identity.runtime

  scope                = azurerm_container_registry.shared.id
  role_definition_name = "AcrPull"
  principal_id         = each.value.principal_id
}
