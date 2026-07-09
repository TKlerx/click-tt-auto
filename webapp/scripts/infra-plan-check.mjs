import { createInfraPlanJson } from "./infra-plan-lib.mjs";

const varFile = process.argv[2] ?? "environments/dev.tfvars";
const requiredTypes = new Set([
  "azurerm_application_insights",
  "azurerm_container_app",
  "azurerm_container_app_environment",
  "azurerm_container_app_job",
  "azurerm_key_vault",
  "azurerm_log_analytics_workspace",
  "azurerm_postgresql_flexible_server",
  "azurerm_postgresql_flexible_server_database",
  "azurerm_private_endpoint",
  "azurerm_role_assignment",
]);

const plan = createInfraPlanJson(varFile);
const plannedTypes = new Set(
  (plan.resource_changes ?? [])
    .filter(
      (change) => !["no-op", "delete"].includes(change.change?.actions?.[0]),
    )
    .map((change) => change.type),
);

const missing = [...requiredTypes].filter((type) => !plannedTypes.has(type));
const containerApps = (plan.resource_changes ?? []).filter(
  (change) => change.type === "azurerm_container_app",
);
const missingNamedApps =
  !containerApps.some((change) => change.name === "app") ||
  !containerApps.some((change) => change.name === "worker");

if (missing.length > 0 || missingNamedApps) {
  if (missing.length > 0) {
    console.error(`Missing required resource types: ${missing.join(", ")}`);
  }
  if (missingNamedApps) {
    console.error("Plan must include app and worker Container Apps.");
  }
  process.exit(1);
}

console.log("Infrastructure plan coverage check passed.");
