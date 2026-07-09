project     = "webapp"
environment = "dev"
location    = "westeurope"

secret_environment = "dev"

app_image_tag    = "dev"
worker_image_tag = "dev"

# Replace these values with outputs from `infra/azure/bootstrap` before planning/applying.
registry_id                   = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ContainerRegistry/registries/webappacr"
registry_login_server         = "webappacr.azurecr.io"
runtime_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/webapp-bootstrap-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/webapp-dev-runtime-mi"
runtime_identity_client_id    = "00000000-0000-0000-0000-000000000000"
runtime_identity_principal_id = "00000000-0000-0000-0000-000000000000"
deployment_identity_client_id = "00000000-0000-0000-0000-000000000000"
deployment_identity_object_id = "00000000-0000-0000-0000-000000000000"

base_path = "/app-starter"
