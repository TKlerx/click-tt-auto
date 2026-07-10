import { spawnSync } from "node:child_process";

const DEFAULT_E2E_DATABASE_URL =
  "postgresql://starter:starter_e2e_password@localhost:55432/business_app_starter_e2e_test";

const databaseUrl =
  process.env.DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;

if (
  !databaseUrl.startsWith("postgresql://") &&
  !databaseUrl.startsWith("postgres://")
) {
  throw new Error("E2E DATABASE_URL must be a PostgreSQL URL.");
}

const parsed = new URL(databaseUrl);
const containerName =
  process.env.E2E_POSTGRES_CONTAINER || "webapp-template-e2e-postgres";
const postgresUser = decodeURIComponent(parsed.username || "starter");
const postgresPassword = decodeURIComponent(
  parsed.password || "starter_e2e_password",
);
const postgresDb =
  parsed.pathname.replace(/^\//, "") || "business_app_starter_e2e_test";
const hostPort = parsed.port || "55432";

ensureDockerPostgres();
ensureTargetDatabase();

const env = {
  DATABASE_URL: databaseUrl,
  MIGRATION_DATABASE_URL: databaseUrl,
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com",
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!",
};

runStep("Generate PostgreSQL Prisma client", "pnpm exec prisma generate", env);
runStep(
  "Reset PostgreSQL E2E schema",
  "pnpm exec prisma migrate reset --force",
  env,
);
runStep("Seed PostgreSQL E2E data", "pnpm exec tsx prisma/seed.ts", env);

function ensureDockerPostgres() {
  const existing = runDockerCaptured([
    "ps",
    "-a",
    "--filter",
    `name=^/${containerName}$`,
    "--format",
    "{{.Names}}:{{.Status}}",
  ]).trim();

  if (existing) {
    if (!existing.includes("Up ")) {
      runDockerStep("Start PostgreSQL E2E container", ["start", containerName]);
    }
  } else {
    runDockerStep("Create PostgreSQL E2E container", [
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      `${hostPort}:5432`,
      "-e",
      `POSTGRES_USER=${postgresUser}`,
      "-e",
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "-e",
      `POSTGRES_DB=${postgresDb}`,
      "postgres:18-alpine",
    ]);
  }

  waitForPostgres();
}

function waitForPostgres() {
  const deadline = Date.now() + 60_000;
  let lastOutput = "";

  while (Date.now() < deadline) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        containerName,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        postgresUser,
        "-d",
        "postgres",
      ],
      { encoding: "utf8" },
    );
    lastOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if ((result.status ?? 1) === 0) {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  throw new Error(
    `Timed out waiting for PostgreSQL E2E container. Last output: ${lastOutput}`,
  );
}

function ensureTargetDatabase() {
  const exists = runDockerCaptured([
    "exec",
    containerName,
    "psql",
    "-U",
    postgresUser,
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname = ${quoteSqlLiteral(postgresDb)}`,
  ]).trim();

  if (exists === "1") {
    return;
  }

  createTargetDatabase();
}

function runStep(label, commandLine, envOverrides = {}) {
  console.log(`> ${label}`);
  const result = spawnSync(getShellCommand(), getShellArgs(commandLine), {
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDockerStep(label, args, envOverrides = {}) {
  console.log(`> ${label}`);
  const result = spawnSync("docker", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDockerCaptured(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    return "";
  }

  return result.stdout ?? "";
}

function createTargetDatabase() {
  console.log("> Create PostgreSQL E2E database");
  const result = spawnSync(
    "docker",
    [
      "exec",
      containerName,
      "psql",
      "-U",
      postgresUser,
      "-d",
      "postgres",
      "-c",
      `CREATE DATABASE ${quoteSqlIdentifier(postgresDb)} OWNER ${quoteSqlIdentifier(postgresUser)}`,
    ],
    {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if ((result.status ?? 1) === 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    return;
  }

  if (/already exists/i.test(output)) {
    console.log(`Database ${postgresDb} already exists.`);
    return;
  }

  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

function quoteSqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function getShellCommand() {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

function getShellArgs(commandLine) {
  return process.platform === "win32"
    ? ["/c", commandLine]
    : ["-lc", commandLine];
}
