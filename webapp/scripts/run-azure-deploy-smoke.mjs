import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const smokeScript = path.join(root, "scripts", "azure-deploy-smoke.ts");

const result = spawnSync(
  process.execPath,
  [tsxCli, smokeScript, ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
