import { createInfraPlanJson } from "./infra-plan-lib.mjs";

const varFile = process.argv[2] ?? "environments/dev.tfvars";
const plan = createInfraPlanJson(varFile);

const checks = [
  {
    address: "module.runtime.azurerm_container_app.app",
    label: "app runtime",
    disallowedSecrets: [
      "admin-database-url",
      "worker-database-url",
      "migration-database-url",
      "initial-admin-email",
      "initial-admin-password",
      "mail-provider",
      "mail-default-mailbox",
      "graph-client-id",
      "graph-client-secret",
      "graph-tenant-id",
    ],
    disallowedEnv: [
      "POSTGRES_ADMIN_DATABASE_URL",
      "WORKER_DATABASE_URL",
      "MIGRATION_DATABASE_URL",
      "INITIAL_ADMIN_EMAIL",
      "INITIAL_ADMIN_PASSWORD",
      "MAIL_PROVIDER",
      "MAIL_DEFAULT_MAILBOX",
      "GRAPH_CLIENT_ID",
      "GRAPH_CLIENT_SECRET",
      "GRAPH_TENANT_ID",
    ],
  },
  {
    address: "module.runtime.azurerm_container_app.worker",
    label: "worker runtime",
    disallowedSecrets: [
      "admin-database-url",
      "app-database-url",
      "migration-database-url",
      "betterauth-secret",
      "initial-admin-email",
      "initial-admin-password",
    ],
    disallowedEnv: [
      "POSTGRES_ADMIN_DATABASE_URL",
      "APP_DATABASE_URL",
      "MIGRATION_DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "INITIAL_ADMIN_EMAIL",
      "INITIAL_ADMIN_PASSWORD",
    ],
  },
  {
    address: "module.runtime.azurerm_container_app_job.migration",
    label: "migration job",
    allowedSecrets: [
      "admin-database-url",
      "app-database-url",
      "worker-database-url",
      "migration-database-url",
      "initial-admin-email",
      "initial-admin-password",
    ],
    allowedEnv: [
      "NODE_ENV",
      "PRISMA_CONFIG_PATH",
      "DATABASE_URL",
      "POSTGRES_ADMIN_DATABASE_URL",
      "APP_DATABASE_URL",
      "WORKER_DATABASE_URL",
      "MIGRATION_DATABASE_URL",
      "INITIAL_ADMIN_EMAIL",
      "INITIAL_ADMIN_PASSWORD",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const resource = findResource(check.address);
  if (!resource) {
    failures.push(`Missing planned resource: ${check.address}`);
    continue;
  }

  const secretNames = blockNames(resource.change?.after?.secret);
  const envNames = containerEnvNames(resource.change?.after?.template);

  if (check.disallowedSecrets) {
    const exposed = check.disallowedSecrets.filter((name) =>
      secretNames.has(name),
    );
    if (exposed.length > 0) {
      failures.push(`${check.label} exposes secrets: ${exposed.join(", ")}`);
    }
  }

  if (check.disallowedEnv) {
    const exposed = check.disallowedEnv.filter((name) => envNames.has(name));
    if (exposed.length > 0) {
      failures.push(`${check.label} exposes env vars: ${exposed.join(", ")}`);
    }
  }

  if (check.allowedSecrets) {
    const unexpected = [...secretNames].filter(
      (name) => !check.allowedSecrets.includes(name),
    );
    if (unexpected.length > 0) {
      failures.push(
        `${check.label} has undocumented secrets: ${unexpected.join(", ")}`,
      );
    }
  }

  if (check.allowedEnv) {
    const unexpected = [...envNames].filter(
      (name) => !check.allowedEnv.includes(name),
    );
    if (unexpected.length > 0) {
      failures.push(
        `${check.label} has undocumented env vars: ${unexpected.join(", ")}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Infrastructure secret exposure check passed.");

function findResource(address) {
  return (plan.resource_changes ?? []).find(
    (change) => change.address === address,
  );
}

function blockNames(blocks) {
  return new Set((blocks ?? []).map((block) => block.name).filter(Boolean));
}

function containerEnvNames(template) {
  const containers = (template ?? []).flatMap((entry) => entry.container ?? []);
  return new Set(
    containers
      .flatMap((container) => container.env ?? [])
      .map((env) => env.name)
      .filter(Boolean),
  );
}
