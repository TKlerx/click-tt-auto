variable "project" {
  description = "Short lowercase project slug used in Azure resource names and tags."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,12}$", var.project))
    error_message = "project must be lowercase, start with a letter, and match ^[a-z][a-z0-9-]{1,12}$."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "secret_environment" {
  description = "Environment label for operator-supplied secrets. Empty defaults to environment and must match the target environment."
  type        = string
  default     = ""

  validation {
    condition     = var.secret_environment == "" || contains(["dev", "staging", "prod"], var.secret_environment)
    error_message = "secret_environment must be empty or one of: dev, staging, prod."
  }
}

variable "location" {
  description = "Azure region for environment resources."
  type        = string
}

variable "app_image_tag" {
  description = "Container image tag for the app runtime and default migration job."
  type        = string

  validation {
    condition     = length(trimspace(var.app_image_tag)) > 0
    error_message = "app_image_tag must be non-empty."
  }
}

variable "worker_image_tag" {
  description = "Container image tag for the worker runtime."
  type        = string

  validation {
    condition     = length(trimspace(var.worker_image_tag)) > 0
    error_message = "worker_image_tag must be non-empty."
  }
}

variable "migration_image_tag" {
  description = "Container image tag for the migration job. Empty means reuse app_image_tag."
  type        = string
  default     = ""
}

variable "base_path" {
  description = "Base path served by the app runtime."
  type        = string
  default     = "/app-starter"
}

variable "app_version" {
  description = "Non-secret application version label displayed by the app and exposed by /api/version."
  type        = string
  default     = ""
}

variable "app_revision" {
  description = "Non-secret source revision displayed by the app and exposed by /api/version."
  type        = string
  default     = ""
}

variable "app_build_id" {
  description = "Non-secret CI/build identifier displayed by the app and exposed by /api/version."
  type        = string
  default     = ""
}

variable "app_built_at" {
  description = "Non-secret build timestamp displayed by the app and exposed by /api/version."
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Optional custom domain. Empty uses the default Container Apps FQDN."
  type        = string
  default     = ""
}

variable "registry_id" {
  description = "Shared bootstrap Azure Container Registry resource id."
  type        = string
}

variable "registry_login_server" {
  description = "Shared bootstrap Azure Container Registry login server."
  type        = string
}

variable "runtime_identity_id" {
  description = "User-assigned managed identity resource id for this environment's runtimes."
  type        = string
}

variable "runtime_identity_client_id" {
  description = "User-assigned managed identity client id for this environment's runtimes."
  type        = string
}

variable "runtime_identity_principal_id" {
  description = "User-assigned managed identity principal id for this environment's runtimes."
  type        = string
}

variable "deployment_identity_client_id" {
  description = "GitHub OIDC deployment application client id."
  type        = string
}

variable "deployment_identity_object_id" {
  description = "GitHub OIDC deployment service principal object id."
  type        = string
}

variable "app_image_repository" {
  description = "ACR repository name for the app image."
  type        = string
  default     = "app"
}

variable "worker_image_repository" {
  description = "ACR repository name for the worker image."
  type        = string
  default     = "worker"
}

variable "migration_image_repository" {
  description = "ACR repository name for the migration image. Empty means reuse app_image_repository."
  type        = string
  default     = ""
}

variable "postgres_sku" {
  description = "Azure Database for PostgreSQL Flexible Server SKU."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_gb" {
  description = "PostgreSQL storage size in GiB."
  type        = number
  default     = 32

  validation {
    condition     = var.postgres_storage_gb >= 32
    error_message = "postgres_storage_gb must be at least 32."
  }
}

variable "postgres_availability_zone" {
  description = "Availability zone for PostgreSQL Flexible Server. Pinning avoids provider drift after Azure selects a zone."
  type        = string
  default     = "2"
}

variable "app_min_replicas" {
  description = "Minimum app replicas."
  type        = number
  default     = 0

  validation {
    condition     = var.app_min_replicas >= 0
    error_message = "app_min_replicas must be zero or greater."
  }
}

variable "app_max_replicas" {
  description = "Maximum app replicas."
  type        = number
  default     = 2

  validation {
    condition     = var.app_max_replicas >= var.app_min_replicas
    error_message = "app_max_replicas must be greater than or equal to app_min_replicas."
  }
}

variable "worker_min_replicas" {
  description = "Minimum worker replicas."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_min_replicas >= 0
    error_message = "worker_min_replicas must be zero or greater."
  }
}

variable "enable_mail" {
  description = "Whether mail integration secrets are required."
  type        = bool
  default     = false
}

variable "mail_provider" {
  description = "Mail provider name stored when enable_mail is true."
  type        = string
  default     = "graph"
}

variable "mail_default_mailbox" {
  description = "Default Graph mailbox stored when enable_mail is true."
  type        = string
  default     = ""
}

variable "graph_client_id" {
  description = "Graph mail client id stored when enable_mail is true."
  type        = string
  default     = ""
}

variable "graph_client_secret" {
  description = "Graph mail client secret stored when enable_mail is true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "graph_tenant_id" {
  description = "Graph mail tenant id stored when enable_mail is true."
  type        = string
  default     = ""
}

variable "enable_teams" {
  description = "Whether Teams integration secrets are required."
  type        = bool
  default     = false
}

variable "azure_ad_client_id" {
  description = "Azure AD client id stored when enable_teams is true."
  type        = string
  default     = ""
}

variable "azure_ad_client_secret" {
  description = "Azure AD client secret stored when enable_teams is true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "azure_ad_tenant_id" {
  description = "Azure AD tenant id stored when enable_teams is true."
  type        = string
  default     = ""
}

variable "teams_delegated_grant_encryption_key" {
  description = "Optional Teams delegated grant encryption key stored when enable_teams is true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "teams_poll_interval_seconds" {
  description = "Teams worker poll interval used when enable_teams is true."
  type        = number
  default     = 60
}

variable "secret_expiration_date" {
  description = "RFC3339 expiration date applied to generated Key Vault secrets; rotate before this date."
  type        = string
  default     = "2027-12-31T23:59:59Z"

  validation {
    condition     = can(formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", var.secret_expiration_date))
    error_message = "secret_expiration_date must be an RFC3339 timestamp such as 2027-12-31T23:59:59Z."
  }
}

variable "allow_destroy_persistent" {
  description = "Explicit operator intent for destructive changes to persistent data resources; lifecycle prevent_destroy still requires a deliberate override."
  type        = bool
  default     = false
}

variable "vnet_address_space" {
  description = "Virtual network address space."
  type        = list(string)
  default     = ["10.42.0.0/16"]
}

variable "container_apps_subnet_address_prefix" {
  description = "Subnet address prefix delegated to Azure Container Apps."
  type        = string
  default     = "10.42.0.0/21"
}

variable "postgres_subnet_address_prefix" {
  description = "Subnet address prefix delegated to Azure Database for PostgreSQL Flexible Server."
  type        = string
  default     = "10.42.8.0/24"
}

variable "private_endpoints_subnet_address_prefix" {
  description = "Subnet address prefix for private endpoints."
  type        = string
  default     = "10.42.9.0/24"
}

variable "key_vault_allowed_ip_rules" {
  description = "Public IPv4/CIDR ranges allowed to access Key Vault data plane for deployment-time secret writes. Keep empty when running OpenTofu from inside the VNet."
  type        = list(string)
  default     = []
}

variable "initial_admin_email" {
  description = "Initial seeded admin email for the migration job."
  type        = string
  default     = "admin@example.com"
}

variable "tags" {
  description = "Additional tags merged into standard environment tags."
  type        = map(string)
  default     = {}
}
