variable "project" {
  description = "Short lowercase project slug used in shared bootstrap resource names."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,12}$", var.project))
    error_message = "project must be lowercase, start with a letter, and match ^[a-z][a-z0-9-]{1,12}$."
  }
}

variable "location" {
  description = "Azure region for shared bootstrap resources."
  type        = string
}

variable "github_owner" {
  description = "GitHub organization or user that owns the repository."
  type        = string

  validation {
    condition     = length(trimspace(var.github_owner)) > 0
    error_message = "github_owner must be non-empty."
  }
}

variable "github_repository" {
  description = "GitHub repository name authorized for OIDC deployment."
  type        = string

  validation {
    condition     = length(trimspace(var.github_repository)) > 0
    error_message = "github_repository must be non-empty."
  }
}

variable "github_environments" {
  description = "GitHub environment names that may request Azure OIDC tokens."
  type        = set(string)
  default     = ["dev", "staging", "prod"]

  validation {
    condition     = length(var.github_environments) > 0
    error_message = "github_environments must contain at least one environment."
  }
}

variable "tags" {
  description = "Additional tags merged into standard bootstrap tags."
  type        = map(string)
  default     = {}
}

variable "state_storage_allowed_ip_rules" {
  description = "Public IPv4/CIDR ranges allowed to access the OpenTofu state storage account data plane."
  type        = list(string)
  default     = []
}
