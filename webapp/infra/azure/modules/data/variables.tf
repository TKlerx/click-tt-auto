variable "name_prefix" {
  description = "Environment name prefix used for data resource names."
  type        = string
}

variable "name_suffix" {
  description = "Deterministic suffix for globally unique names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for data resources."
  type        = string
}

variable "delegated_subnet_id" {
  description = "Delegated subnet resource id for PostgreSQL Flexible Server."
  type        = string
}

variable "private_dns_zone_id" {
  description = "Private DNS zone resource id for PostgreSQL Flexible Server."
  type        = string
}

variable "postgres_sku" {
  description = "Azure Database for PostgreSQL Flexible Server SKU."
  type        = string
}

variable "postgres_storage_gb" {
  description = "PostgreSQL storage size in GiB."
  type        = number
}

variable "postgres_availability_zone" {
  description = "Availability zone for PostgreSQL Flexible Server."
  type        = string
}

variable "allow_destroy_persistent" {
  description = "Reserved explicit opt-in for destructive persistent-resource operations."
  type        = bool
}

variable "tags" {
  description = "Tags applied to data resources."
  type        = map(string)
}
