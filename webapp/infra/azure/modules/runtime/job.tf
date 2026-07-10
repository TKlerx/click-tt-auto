resource "azurerm_container_app_job" "migration" {
  name                         = "${var.name_prefix}-migration"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.environment.id
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 0
  workload_profile_name        = "Consumption"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.runtime_identity_id]
  }

  registry {
    server   = var.registry_login_server
    identity = var.runtime_identity_id
  }

  secret {
    name                = "admin-database-url"
    key_vault_secret_id = var.admin_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "app-database-url"
    key_vault_secret_id = var.app_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "worker-database-url"
    key_vault_secret_id = var.worker_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "migration-database-url"
    key_vault_secret_id = var.migration_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "initial-admin-email"
    key_vault_secret_id = var.initial_admin_email_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "initial-admin-password"
    key_vault_secret_id = var.initial_admin_password_secret_id
    identity            = var.runtime_identity_id
  }

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  template {
    container {
      name   = "migration"
      image  = var.migration_image_ref
      cpu    = 0.5
      memory = "1Gi"

      command = ["/bin/sh", "-c"]
      args = [
        "node scripts/postgres-provision-roles.mjs && node scripts/prisma-predeploy-check.js && ./node_modules/.bin/prisma migrate deploy && node scripts/seed-initial-admin.mjs",
      ]

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "APP_ENVIRONMENT"
        value = var.app_environment
      }

      env {
        name  = "APP_VERSION"
        value = var.app_version
      }

      env {
        name  = "APP_REVISION"
        value = var.app_revision
      }

      env {
        name  = "APP_BUILD_ID"
        value = var.app_build_id
      }

      env {
        name  = "APP_BUILT_AT"
        value = var.app_built_at
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "migration-database-url"
      }

      env {
        name        = "POSTGRES_ADMIN_DATABASE_URL"
        secret_name = "admin-database-url"
      }

      env {
        name        = "APP_DATABASE_URL"
        secret_name = "app-database-url"
      }

      env {
        name        = "WORKER_DATABASE_URL"
        secret_name = "worker-database-url"
      }

      env {
        name        = "MIGRATION_DATABASE_URL"
        secret_name = "migration-database-url"
      }

      env {
        name        = "INITIAL_ADMIN_EMAIL"
        secret_name = "initial-admin-email"
      }

      env {
        name        = "INITIAL_ADMIN_PASSWORD"
        secret_name = "initial-admin-password"
      }
    }
  }
}
