variable "name_prefix" {
  description = "Environment name prefix used for Azure resource names."
  type        = string
}

variable "resource_group_name" {
  description = "Environment resource group name."
  type        = string
}

variable "location" {
  description = "Azure region for observability resources."
  type        = string
}

variable "allow_destroy_persistent" {
  description = "Reserved explicit opt-in for destructive persistent-resource operations."
  type        = bool
}

variable "tags" {
  description = "Tags applied to observability resources."
  type        = map(string)
}
