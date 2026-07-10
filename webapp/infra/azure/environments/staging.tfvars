project     = "webapp"
environment = "staging"
location    = "westeurope"

secret_environment = "staging"

app_image_tag    = "staging"
worker_image_tag = "staging"

# Replace these values with outputs from `infra/azure/bootstrap` before planning/applying.
registry_id                   = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ContainerRegistry/registries/webappacr"
registry_login_server         = "webappacr.azurecr.io"
runtime_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/webapp-staging-runtime-mi"
runtime_identity_client_id    = "11111111-1111-1111-1111-111111111111"
runtime_identity_principal_id = "11111111-1111-1111-1111-111111111111"
deployment_identity_client_id = "11111111-1111-1111-1111-111111111111"
deployment_identity_object_id = "11111111-1111-1111-1111-111111111111"

base_path = "/app-starter"

vnet_address_space                      = ["10.43.0.0/16"]
container_apps_subnet_address_prefix    = "10.43.0.0/21"
postgres_subnet_address_prefix          = "10.43.8.0/24"
private_endpoints_subnet_address_prefix = "10.43.9.0/24"

tags = {
  tier = "staging"
}
