import { createInfraPlanJson } from "./infra-plan-lib.mjs";

const varFile = process.argv[2] ?? "environments/dev.tfvars";
const plan = createInfraPlanJson(varFile);
const changes = plan.resource_changes ?? [];

const findResource = (type, name) =>
  changes.find((change) => change.type === type && change.name === name);

const getChange = (type, name) => findResource(type, name)?.change;
const getAfter = (type, name) => getChange(type, name)?.after;
const hasKnownOrUnknown = (change, property) =>
  Boolean(change?.after?.[property] ?? change?.after_unknown?.[property]);

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const environmentChange = getChange(
  "azurerm_container_app_environment",
  "environment",
);
const environment = environmentChange?.after;
if (environment?.logs_destination !== "log-analytics") {
  fail("Container Apps environment must send logs to Log Analytics.");
}
if (!hasKnownOrUnknown(environmentChange, "log_analytics_workspace_id")) {
  fail("Container Apps environment must reference a Log Analytics workspace.");
}

const app = getAfter("azurerm_container_app", "app");
const appEnv = app?.template?.[0]?.container?.[0]?.env ?? [];
const appInsightsEnv = appEnv.find(
  (entry) => entry.name === "APPLICATIONINSIGHTS_CONNECTION_STRING",
);
if (!appInsightsEnv) {
  fail("App container must expose APPLICATIONINSIGHTS_CONNECTION_STRING.");
}

const diagnosticSettings = changes.filter(
  (change) => change.type === "azurerm_monitor_diagnostic_setting",
);
const requiredDiagnostics = ["app_metrics", "worker_metrics"];
for (const name of requiredDiagnostics) {
  const setting = diagnosticSettings.find((change) => change.name === name);
  const metrics = setting?.change?.after?.enabled_metric ?? [];
  if (!setting) {
    fail(`Missing diagnostic setting ${name}.`);
    continue;
  }
  if (!hasKnownOrUnknown(setting.change, "log_analytics_workspace_id")) {
    fail(`${name} must send metrics to Log Analytics.`);
  }
  if (!metrics.some((metric) => metric.category === "AllMetrics")) {
    fail(`${name} must enable AllMetrics.`);
  }
}

const outputs = plan.planned_values?.outputs ?? {};
if (!outputs.log_analytics_workspace_id) {
  fail("Missing log_analytics_workspace_id output.");
}
if (!outputs.app_insights_connection_string?.sensitive) {
  fail("app_insights_connection_string output must be sensitive.");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Infrastructure observability check passed.");
