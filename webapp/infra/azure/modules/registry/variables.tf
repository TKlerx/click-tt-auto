variable "name_prefix" {
  description = "Environment name prefix used for Azure resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for registry network resources."
  type        = string
}

variable "registry_id" {
  description = "Shared Azure Container Registry resource id."
  type        = string
}

variable "private_endpoint_subnet_id" {
  description = "Private endpoint subnet resource id."
  type        = string
}

variable "virtual_network_id" {
  description = "Environment virtual network id."
  type        = string
}

variable "tags" {
  description = "Tags applied to registry network resources."
  type        = map(string)
}
