output "acr_private_dns_zone_id" {
  description = "ACR private DNS zone id."
  value       = azurerm_private_dns_zone.acr.id
}

output "acr_private_endpoint_id" {
  description = "ACR private endpoint id."
  value       = azurerm_private_endpoint.acr.id
}
