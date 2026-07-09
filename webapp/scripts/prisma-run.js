const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const { computeExitCode } = require("./prisma-run-lib");

const root = path.resolve(__dirname, "..");
const envLocal = path.join(root, ".env.local");
const envDefault = path.join(root, ".env");

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-run.js <prisma args>");
  process.exit(1);
}

const localPrismaCommand = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const hasLocalPrisma = fs.existsSync(localPrismaCommand);
const command = hasLocalPrisma ? localPrismaCommand : pnpmCommand;
const commandArgs = hasLocalPrisma ? args : ["exec", "prisma", ...args];

const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(computeExitCode(result));
