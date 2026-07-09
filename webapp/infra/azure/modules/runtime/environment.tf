resource "azurerm_container_app_environment" "environment" {
  name                               = "${var.name_prefix}-aca-env"
  resource_group_name                = var.resource_group_name
  location                           = var.location
  infrastructure_subnet_id           = var.container_apps_subnet_id
  log_analytics_workspace_id         = var.log_analytics_workspace_id
  logs_destination                   = "log-analytics"
  public_network_access              = "Enabled"
  infrastructure_resource_group_name = "${var.name_prefix}-aca-infra-rg"
  tags                               = var.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}
