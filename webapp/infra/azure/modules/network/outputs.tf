output "virtual_network_id" {
  description = "Virtual network resource id."
  value       = azurerm_virtual_network.environment.id
}

output "virtual_network_name" {
  description = "Virtual network name."
  value       = azurerm_virtual_network.environment.name
}

output "container_apps_subnet_id" {
  description = "Delegated Container Apps subnet resource id."
  value       = azurerm_subnet.container_apps.id
}

output "postgres_subnet_id" {
  description = "Delegated PostgreSQL subnet resource id."
  value       = azurerm_subnet.postgres.id
}

output "private_endpoints_subnet_id" {
  description = "Private endpoints subnet resource id."
  value       = azurerm_subnet.private_endpoints.id
}

output "postgres_private_dns_zone_id" {
  description = "PostgreSQL private DNS zone resource id."
  value       = azurerm_private_dns_zone.postgres.id
}

output "postgres_private_dns_zone_name" {
  description = "PostgreSQL private DNS zone name."
  value       = azurerm_private_dns_zone.postgres.name
}
