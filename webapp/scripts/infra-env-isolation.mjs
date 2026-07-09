import { createInfraPlanJson } from "./infra-plan-lib.mjs";

const [
  leftVarFile = "environments/dev.tfvars",
  rightVarFile = "environments/staging.tfvars",
] = process.argv.slice(2);

const environments = [
  {
    label: "dev",
    prefix: "webapp-dev",
    plan: createInfraPlanJson(leftVarFile),
  },
  {
    label: "staging",
    prefix: "webapp-staging",
    plan: createInfraPlanJson(rightVarFile),
  },
];

const allowedSharedNames = new Set([
  "privatelink.azurecr.io",
  "privatelink.postgres.database.azure.com",
  "privatelink.vaultcore.azure.net",
  "webappacr",
  "webappacr.azurecr.io",
]);

const ignoredDuplicateResourceTypes = new Set([
  "azurerm_key_vault_secret",
  "azurerm_role_assignment",
  "random_password",
  "random_string",
]);

for (const environment of environments) {
  assertEnvironmentPlan(environment);
}

assertNoSharedNames(environments[0], environments[1]);

console.log("Infrastructure environment isolation check passed.");

function assertEnvironmentPlan(environment) {
  const outputs = knownOutputs(environment.plan);
  const expectedResourceGroup = `${environment.prefix}-rg`;
  const expectedDatabase = `${environment.prefix.replaceAll("-", "_")}_app`;

  expectEqual(
    outputs.resource_group_name,
    expectedResourceGroup,
    `${environment.label} resource_group_name output`,
  );
  expectEqual(
    outputs.database_name,
    expectedDatabase,
    `${environment.label} database_name output`,
  );
  expectEqual(
    outputs.app_container_app_name,
    `${environment.prefix}-app`,
    `${environment.label} app_container_app_name output`,
  );
  expectEqual(
    outputs.worker_container_app_name,
    `${environment.prefix}-worker`,
    `${environment.label} worker_container_app_name output`,
  );
  expectEqual(
    outputs.migration_job_name,
    `${environment.prefix}-migration`,
    `${environment.label} migration_job_name output`,
  );

  for (const change of environment.plan.resource_changes ?? []) {
    const after = change.change?.after;
    if (!after || typeof after !== "object") {
      continue;
    }

    if (after.tags && after.tags.environment !== environment.label) {
      fail(
        `${change.address} has environment tag ${JSON.stringify(
          after.tags.environment,
        )}; expected ${environment.label}`,
      );
    }

    if (
      typeof after.resource_group_name === "string" &&
      after.resource_group_name !== expectedResourceGroup
    ) {
      fail(
        `${change.address} uses resource_group_name ${after.resource_group_name}; expected ${expectedResourceGroup}`,
      );
    }

    const name = typeof after.name === "string" ? after.name : undefined;
    if (name?.startsWith("webapp-") && !name.startsWith(environment.prefix)) {
      fail(
        `${change.address} name ${name} is not scoped to ${environment.prefix}`,
      );
    }
  }
}

function assertNoSharedNames(left, right) {
  const leftNames = knownNames(left.plan);
  const rightNames = knownNames(right.plan);
  const rightByName = new Map(rightNames.map((entry) => [entry.value, entry]));

  for (const leftEntry of leftNames) {
    if (allowedSharedNames.has(leftEntry.value)) {
      continue;
    }

    const rightEntry = rightByName.get(leftEntry.value);
    if (!rightEntry) {
      continue;
    }

    fail(
      `Shared name ${JSON.stringify(leftEntry.value)} found in ${leftEntry.address}.${leftEntry.key} and ${rightEntry.address}.${rightEntry.key}`,
    );
  }
}

function knownNames(plan) {
  const names = [];

  for (const change of plan.resource_changes ?? []) {
    if (ignoredDuplicateResourceTypes.has(change.type)) {
      continue;
    }

    const after = change.change?.after;
    if (!after || typeof after !== "object") {
      continue;
    }

    for (const key of ["name", "resource_group_name", "database_name"]) {
      const value = after[key];
      if (typeof value === "string" && value.length > 0) {
        names.push({
          address: change.address,
          key,
          value,
        });
      }
    }
  }

  for (const [name, value] of Object.entries(knownOutputs(plan))) {
    if (typeof value === "string" && value.length > 0) {
      names.push({
        address: `output.${name}`,
        key: "value",
        value,
      });
    }
  }

  return names;
}

function knownOutputs(plan) {
  const outputs = {};
  for (const [name, output] of Object.entries(
    plan.planned_values?.outputs ?? {},
  )) {
    if (typeof output.value === "string") {
      outputs[name] = output.value;
    }
  }
  return outputs;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(
      `${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}

function fail(message) {
  console.error(
    `Infrastructure environment isolation check failed: ${message}`,
  );
  process.exit(1);
}
