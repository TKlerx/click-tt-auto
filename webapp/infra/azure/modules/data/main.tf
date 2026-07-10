resource "random_password" "admin" {
  length           = 32
  special          = true
  override_special = "_%@"
}

resource "random_password" "app" {
  length           = 32
  special          = true
  override_special = "_%@"
}

resource "random_password" "worker" {
  length           = 32
  special          = true
  override_special = "_%@"
}

resource "random_password" "migration" {
  length           = 32
  special          = true
  override_special = "_%@"
}

locals {
  database_name     = "business_app_starter"
  admin_username    = "pgadmin"
  app_username      = "app_runtime"
  worker_username   = "worker_runtime"
  migration_user    = "migration_runtime"
  database_host     = azurerm_postgresql_flexible_server.app.fqdn
  database_port     = 5432
  connection_suffix = "@${local.database_host}:${local.database_port}/${local.database_name}?sslmode=require"
}

resource "azurerm_postgresql_flexible_server" "app" {
  name                          = "${var.name_prefix}-${var.name_suffix}-pg"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = "16"
  delegated_subnet_id           = var.delegated_subnet_id
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false
  administrator_login           = local.admin_username
  administrator_password        = random_password.admin.result
  zone                          = var.postgres_availability_zone
  storage_mb                    = var.postgres_storage_gb * 1024
  sku_name                      = var.postgres_sku
  tags                          = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = local.database_name
  server_id = azurerm_postgresql_flexible_server.app.id
  collation = "en_US.utf8"
  charset   = "UTF8"

  lifecycle {
    prevent_destroy = true
  }
}
