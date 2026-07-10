const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const prismaConfigPath = process.env.PRISMA_CONFIG_PATH?.trim();
const databaseUrl =
  process.env.MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "MIGRATION_DATABASE_URL or DATABASE_URL must be set for pre-deploy Prisma verification.",
  );
  process.exit(1);
}

process.env.DATABASE_URL = databaseUrl;

if (databaseUrl.startsWith("file:")) {
  const databasePath = databaseUrl.replace("file:", "");
  if (!fs.existsSync(databasePath)) {
    console.log(
      `Local database not found at ${databasePath}; treating as fresh bootstrap and skipping drift check.`,
    );
    process.exit(0);
  }
}

const prismaArgs = ["migrate", "status"];
if (prismaConfigPath) {
  prismaArgs.push("--config", prismaConfigPath);
}

const statusResult = spawnSync(
  process.execPath,
  [path.join("scripts", "prisma-run.js"), ...prismaArgs],
  {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
  },
);

const statusOutput = `${statusResult.stdout ?? ""}${statusResult.stderr ?? ""}`;
if (statusResult.stdout) {
  process.stdout.write(statusResult.stdout);
}
if (statusResult.stderr) {
  process.stderr.write(statusResult.stderr);
}

const statusExitCode = statusResult.status ?? 1;
const hasPendingMigrations =
  statusOutput.includes("Following migrations have not yet been applied:") ||
  statusOutput.includes("Following migration have not yet been applied:");

if (statusExitCode !== 0 && !hasPendingMigrations) {
  process.exit(statusExitCode);
}

if (hasPendingMigrations) {
  console.log(
    "Pending migrations detected; continuing so deploy can apply them.",
  );
}

console.log("Prisma pre-deploy verification passed.");
