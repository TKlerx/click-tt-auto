resource "azurerm_monitor_diagnostic_setting" "app_metrics" {
  name                       = "${var.name_prefix}-app-metrics"
  target_resource_id         = azurerm_container_app.app.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "worker_metrics" {
  name                       = "${var.name_prefix}-worker-metrics"
  target_resource_id         = azurerm_container_app.worker.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_metric {
    category = "AllMetrics"
  }
}
