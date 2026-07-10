output "database_host" {
  description = "PostgreSQL Flexible Server FQDN."
  value       = local.database_host
}

output "database_name" {
  description = "Application database name."
  value       = local.database_name
}

output "admin_database_url" {
  description = "Admin database URL for role provisioning."
  value       = "postgresql://${urlencode(local.admin_username)}:${urlencode(random_password.admin.result)}${local.connection_suffix}"
  sensitive   = true
}

output "app_database_url" {
  description = "App runtime database URL."
  value       = "postgresql://${urlencode(local.app_username)}:${urlencode(random_password.app.result)}${local.connection_suffix}"
  sensitive   = true
}

output "worker_database_url" {
  description = "Worker runtime database URL."
  value       = "postgresql://${urlencode(local.worker_username)}:${urlencode(random_password.worker.result)}${local.connection_suffix}"
  sensitive   = true
}

output "migration_database_url" {
  description = "Migration database URL."
  value       = "postgresql://${urlencode(local.migration_user)}:${urlencode(random_password.migration.result)}${local.connection_suffix}"
  sensitive   = true
}
