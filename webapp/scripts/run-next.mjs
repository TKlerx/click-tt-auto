import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const command = process.argv[2];

if (!command || !["dev", "start"].includes(command)) {
  console.error("Usage: node scripts/run-next.mjs <dev|start>");
  process.exit(1);
}

const port = process.env.PORT ?? "3270";
const basePath = normalizeBasePath(process.env.BASE_PATH ?? "");

if (command === "dev") {
  const localUrl = `http://localhost:${port}${basePath}`;
  console.log(`> Local: ${localUrl}`);
}

const standaloneServer = [
  ".next/standalone/server.js",
  ".next/standalone/webapp/server.js",
].find((path) => existsSync(path));

const args =
  command === "start" && standaloneServer && process.platform !== "win32"
    ? [standaloneServer]
    : ["./node_modules/next/dist/bin/next", command, "--port", port];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
