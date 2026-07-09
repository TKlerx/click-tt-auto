import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

if (!databaseUrl.startsWith("file:")) {
  process.exit(0);
}

runStep("Generate local SQLite Prisma client", "pnpm exec prisma generate");

const databasePath = path.resolve(
  process.cwd(),
  databaseUrl.slice("file:".length),
);
const db = new Database(databasePath);
let databaseIsEmpty = true;

try {
  databaseIsEmpty = isEmptyDatabase(db);
} finally {
  db.close();
}

if (databaseIsEmpty) {
  runStep("Push local SQLite schema", "pnpm exec prisma db push");
  markExistingMigrationsAsApplied();
} else {
  runStep("Apply local SQLite migrations", "pnpm exec prisma migrate dev");
}

runStep("Seed local starter data", "pnpm exec tsx prisma/seed.ts");

function isEmptyDatabase(database) {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get();

  return !row || row.count === 0;
}

function runStep(label, commandLine) {
  console.log(`> ${label}`);
  const result = spawnSync(getShellCommand(), getShellArgs(commandLine), {
    stdio: "inherit",
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function markExistingMigrationsAsApplied() {
  const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(migrationsRoot)) {
    return;
  }

  const migrations = fs
    .readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    runStep(
      `Mark local migration ${migration} as applied`,
      `pnpm exec prisma migrate resolve --applied ${migration}`,
    );
  }
}

function getShellCommand() {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

function getShellArgs(commandLine) {
  return process.platform === "win32"
    ? ["/c", commandLine]
    : ["-lc", commandLine];
}
