terraform {
  backend "azurerm" {
    # Replace these from bootstrap outputs or pass them via -backend-config.
    resource_group_name  = "replace-with-bootstrap-resource-group"
    storage_account_name = "replacewithstateaccount"
    container_name       = "tfstate"
    key                  = "app/dev.tfstate"
    use_oidc             = true
  }
}
