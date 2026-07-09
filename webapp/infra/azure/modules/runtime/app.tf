resource "azurerm_container_app" "app" {
  name                         = "${var.name_prefix}-app"
  container_app_environment_id = azurerm_container_app_environment.environment.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Multiple"
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
    name                = "app-database-url"
    key_vault_secret_id = var.app_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  secret {
    name                = "betterauth-secret"
    key_vault_secret_id = var.better_auth_secret_id
    identity            = var.runtime_identity_id
  }

  dynamic "secret" {
    for_each = local.app_optional_secret_ids

    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = var.runtime_identity_id
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 3270
    transport                  = "http"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.app_min_replicas
    max_replicas = var.app_max_replicas

    container {
      name   = "app"
      image  = var.app_image_ref
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "3270"
      }

      env {
        name  = "BASE_PATH"
        value = var.base_path
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
        name  = "AUTH_BASE_URL"
        value = local.auth_base_url
      }

      env {
        name        = "APP_DATABASE_URL"
        secret_name = "app-database-url"
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "app-database-url"
      }

      env {
        name        = "BETTER_AUTH_SECRET"
        secret_name = "betterauth-secret"
      }

      dynamic "env" {
        for_each = var.enable_teams ? {
          AZURE_AD_CLIENT_ID                   = "azure-ad-client-id"
          AZURE_AD_CLIENT_SECRET               = "azure-ad-client-secret"
          AZURE_AD_TENANT_ID                   = "azure-ad-tenant-id"
          TEAMS_DELEGATED_GRANT_ENCRYPTION_KEY = "teams-delegated-grant-encryption-key"
        } : {}

        content {
          name        = env.key
          secret_name = env.value
        }
      }

      env {
        name  = "TEAMS_ENABLED"
        value = var.enable_teams ? "true" : "false"
      }

      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = var.app_insights_connection_string
      }
    }
  }
}
