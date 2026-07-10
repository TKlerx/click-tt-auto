terraform {
  required_version = ">= 1.8"

  required_providers {
    azuread = {
      source = "hashicorp/azuread"
    }

    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }

    random = {
      source = "hashicorp/random"
    }
  }
}

provider "azuread" {}

provider "azurerm" {
  features {}
}
