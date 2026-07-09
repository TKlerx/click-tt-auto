variable "name_prefix" {
  description = "Environment name prefix used for Azure resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for network resources."
  type        = string
}

variable "vnet_address_space" {
  description = "Virtual network address space."
  type        = list(string)
}

variable "container_apps_subnet_address_prefix" {
  description = "Subnet address prefix delegated to Azure Container Apps."
  type        = string
}

variable "postgres_subnet_address_prefix" {
  description = "Subnet address prefix delegated to Azure Database for PostgreSQL Flexible Server."
  type        = string
}

variable "private_endpoints_subnet_address_prefix" {
  description = "Subnet address prefix for private endpoints."
  type        = string
}

variable "tags" {
  description = "Tags applied to supported network resources."
  type        = map(string)
}
