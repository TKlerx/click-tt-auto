import { spawnSync } from "node:child_process";
import net from "node:net";

import { resolveE2eDatabaseUrl } from "./e2e-database-url.mjs";

const databaseUrl = resolveE2eDatabaseUrl();

if (
  !databaseUrl.startsWith("postgresql://") &&
  !databaseUrl.startsWith("postgres://")
) {
  throw new Error("E2E DATABASE_URL must be a PostgreSQL URL.");
}

const parsed = new URL(databaseUrl);
const containerName =
  process.env.E2E_POSTGRES_CONTAINER || "click-tt-e2e-postgres";
const postgresImage = process.env.E2E_POSTGRES_IMAGE || "postgres:18-alpine";
const postgresUser = decodeURIComponent(parsed.username || "starter");
const postgresPassword = decodeURIComponent(
  parsed.password || "starter_e2e_password",
);
const postgresDb =
  parsed.pathname.replace(/^\//, "") || "business_app_starter_e2e_test";
const hostPort = parsed.port || "45432";

if (isLocalPostgres(parsed.hostname)) {
  await ensureDockerPostgres();
  ensureTargetDatabase();
}

const env = {
  APP_DATABASE_URL: databaseUrl,
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

async function ensureDockerPostgres() {
  const existing = runDockerCaptured([
    "ps",
    "-a",
    "--filter",
    `name=^/${containerName}$`,
    "--format",
    "{{.Names}}:{{.Status}}",
  ]).trim();

  if (existing) {
    if (!containerMatchesRequestedRuntime()) {
      runDockerStep("Recreate PostgreSQL E2E container", [
        "rm",
        "-f",
        containerName,
      ]);
      createPostgresContainer();
      waitForPostgres();
      await waitForPublishedPort();
      return;
    }
    if (!existing.includes("Up ")) {
      runDockerStep("Start PostgreSQL E2E container", ["start", containerName]);
    }
  } else {
    createPostgresContainer();
  }

  waitForPostgres();
  await waitForPublishedPort();
}

function createPostgresContainer() {
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
    postgresImage,
  ]);
}

function containerMatchesRequestedRuntime() {
  return containerPublishesRequestedPort() && containerUsesRequestedImage();
}

function containerPublishesRequestedPort() {
  const published = runDockerCaptured(["port", containerName, "5432/tcp"]);
  return published
    .split(/\r?\n/)
    .some((line) => line.trim().endsWith(`:${hostPort}`));
}

function containerUsesRequestedImage() {
  return (
    runDockerCaptured([
      "inspect",
      "-f",
      "{{.Config.Image}}",
      containerName,
    ]).trim() === postgresImage
  );
}

// pg_isready only proves PostgreSQL is up inside the container. The published
// port can still be unreachable from the host, which otherwise surfaces later
// as an unexplained Prisma P1001.
async function waitForPublishedPort() {
  const deadline = Date.now() + 30_000;
  let lastError = "";

  while (Date.now() < deadline) {
    lastError = await probeHostPort();
    if (!lastError) return;
    await delay(500);
  }

  throw new Error(
    [
      `PostgreSQL is running inside ${containerName}, but ${parsed.hostname}:${hostPort} is not reachable from this host (${lastError}).`,
      process.platform === "win32"
        ? [
            "On Windows this usually means the port falls inside a reserved range. Check:",
            "  netsh interface ipv4 show excludedportrange protocol=tcp",
            `If ${hostPort} falls inside a listed range, set DATABASE_URL to a free port below 49152.`,
          ].join("\n")
        : "Check that the container's published port is not blocked by the host.",
    ].join("\n"),
  );
}

function probeHostPort() {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: parsed.hostname,
      port: Number(hostPort),
    });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2000);
    socket.on("connect", () => finish(""));
    socket.on("timeout", () => finish("timed out"));
    socket.on("error", (error) => finish(error.code ?? String(error)));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalPostgres(hostname) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
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
