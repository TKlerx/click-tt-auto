resource "azurerm_log_analytics_workspace" "environment" {
  name                       = "${var.name_prefix}-logs"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  sku                        = "PerGB2018"
  retention_in_days          = 30
  internet_ingestion_enabled = true
  internet_query_enabled     = true
  tags                       = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_application_insights" "app" {
  name                       = "${var.name_prefix}-appi"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  workspace_id               = azurerm_log_analytics_workspace.environment.id
  application_type           = "web"
  internet_ingestion_enabled = true
  internet_query_enabled     = true
  tags                       = var.tags

  lifecycle {
    prevent_destroy = true
  }
}
