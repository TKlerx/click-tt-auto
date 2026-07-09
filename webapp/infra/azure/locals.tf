resource "random_string" "name_suffix" {
  length  = 6
  lower   = true
  numeric = true
  special = false
  upper   = false

  keepers = {
    project     = var.project
    environment = var.environment
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  name_suffix = random_string.name_suffix.result

  resource_group_name = "${local.name_prefix}-rg"

  effective_secret_environment = length(trimspace(var.secret_environment)) > 0 ? trimspace(var.secret_environment) : var.environment

  migration_image_tag = coalesce(
    length(trimspace(var.migration_image_tag)) > 0 ? trimspace(var.migration_image_tag) : null,
    var.app_image_tag,
  )

  migration_image_repository = coalesce(
    length(trimspace(var.migration_image_repository)) > 0 ? trimspace(var.migration_image_repository) : null,
    var.app_image_repository,
  )

  app_image_ref       = "${var.registry_login_server}/${var.app_image_repository}:${var.app_image_tag}"
  worker_image_ref    = "${var.registry_login_server}/${var.worker_image_repository}:${var.worker_image_tag}"
  migration_image_ref = "${var.registry_login_server}/${local.migration_image_repository}:${local.migration_image_tag}"

  standard_tags = {
    environment = var.environment
    project     = var.project
    managed-by  = "opentofu"
  }

  tags = merge(local.standard_tags, var.tags)
}
