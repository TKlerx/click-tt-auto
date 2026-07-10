resource "azurerm_virtual_network" "environment" {
  name                = "${var.name_prefix}-vnet"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = var.vnet_address_space
  tags                = var.tags
}

resource "azurerm_subnet" "container_apps" {
  name                 = "${var.name_prefix}-aca-snet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.environment.name
  address_prefixes     = [var.container_apps_subnet_address_prefix]

  delegation {
    name = "container-apps"

    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "postgres" {
  name                 = "${var.name_prefix}-postgres-snet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.environment.name
  address_prefixes     = [var.postgres_subnet_address_prefix]

  delegation {
    name = "postgres-flexible-server"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "${var.name_prefix}-private-endpoints-snet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.environment.name
  address_prefixes     = [var.private_endpoints_subnet_address_prefix]
}

resource "azurerm_private_dns_zone" "postgres" {
  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "${var.name_prefix}-postgres-dns-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.environment.id
  registration_enabled  = false
  tags                  = var.tags
}
