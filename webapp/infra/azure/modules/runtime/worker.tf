resource "azurerm_container_app" "worker" {
  name                         = "${var.name_prefix}-worker"
  container_app_environment_id = azurerm_container_app_environment.environment.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
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
    name                = "worker-database-url"
    key_vault_secret_id = var.worker_database_url_secret_id
    identity            = var.runtime_identity_id
  }

  dynamic "secret" {
    for_each = local.worker_optional_secret_ids

    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = var.runtime_identity_id
    }
  }

  template {
    min_replicas = var.worker_min_replicas
    max_replicas = max(var.worker_min_replicas, 1)

    container {
      name   = "worker"
      image  = var.worker_image_ref
      cpu    = 0.5
      memory = "1Gi"

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
        name        = "WORKER_DATABASE_URL"
        secret_name = "worker-database-url"
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "worker-database-url"
      }

      dynamic "env" {
        for_each = var.enable_mail ? {
          MAIL_PROVIDER        = "mail-provider"
          MAIL_DEFAULT_MAILBOX = "mail-default-mailbox"
          GRAPH_CLIENT_ID      = "graph-client-id"
          GRAPH_CLIENT_SECRET  = "graph-client-secret"
          GRAPH_TENANT_ID      = "graph-tenant-id"
        } : {}

        content {
          name        = env.key
          secret_name = env.value
        }
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
        name  = "TEAMS_POLL_INTERVAL_SECONDS"
        value = tostring(var.teams_poll_interval_seconds)
      }
    }
  }
}
