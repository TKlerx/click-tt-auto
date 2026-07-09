terraform {
  required_version = ">= 1.8"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }

    azuread = {
      source = "hashicorp/azuread"
    }

    random = {
      source = "hashicorp/random"
    }
  }
}

provider "azurerm" {
  features {}
}

provider "azuread" {}
