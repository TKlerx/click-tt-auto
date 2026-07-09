output "app_endpoint" {
  description = "Public app endpoint including base path."
  value       = local.auth_base_url
}

output "app_fqdn" {
  description = "Raw app Container App FQDN."
  value       = azurerm_container_app.app.ingress[0].fqdn
}

output "migration_job_name" {
  description = "Migration Container Apps Job name."
  value       = azurerm_container_app_job.migration.name
}

output "app_container_app_name" {
  description = "App Container App name."
  value       = azurerm_container_app.app.name
}

output "worker_container_app_name" {
  description = "Worker Container App name."
  value       = azurerm_container_app.worker.name
}
