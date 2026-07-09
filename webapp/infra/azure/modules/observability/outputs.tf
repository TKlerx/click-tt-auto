output "log_analytics_workspace_id" {
  description = "Log Analytics workspace resource id."
  value       = azurerm_log_analytics_workspace.environment.id
}

output "app_insights_connection_string" {
  description = "Application Insights connection string."
  value       = azurerm_application_insights.app.connection_string
  sensitive   = true
}
