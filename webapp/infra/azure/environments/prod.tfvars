project     = "webapp"
environment = "prod"
location    = "westeurope"

secret_environment = "prod"

app_image_tag    = "prod"
worker_image_tag = "prod"

# Replace these values with outputs from `infra/azure/bootstrap` before planning/applying.
registry_id                   = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ContainerRegistry/registries/webappacr"
registry_login_server         = "webappacr.azurecr.io"
runtime_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/webapp-prod-runtime-mi"
runtime_identity_client_id    = "22222222-2222-2222-2222-222222222222"
runtime_identity_principal_id = "22222222-2222-2222-2222-222222222222"
deployment_identity_client_id = "22222222-2222-2222-2222-222222222222"
deployment_identity_object_id = "22222222-2222-2222-2222-222222222222"

base_path = "/app-starter"

postgres_sku        = "GP_Standard_D2s_v3"
postgres_storage_gb = 128

app_min_replicas    = 1
app_max_replicas    = 4
worker_min_replicas = 1

vnet_address_space                      = ["10.44.0.0/16"]
container_apps_subnet_address_prefix    = "10.44.0.0/21"
postgres_subnet_address_prefix          = "10.44.8.0/24"
private_endpoints_subnet_address_prefix = "10.44.9.0/24"

tags = {
  tier = "production"
}
