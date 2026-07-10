import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATTERNS = [
  {
    pattern: /\bconsole\.(log|info|warn|error|debug)\s*\(/,
    remediation: "Use the structured logger from src/lib/logger.ts.",
  },
];
const WORKER_PATTERNS = [
  {
    pattern: /\bprint\s*\(/,
    remediation:
      "Use the worker structured logger from starter_worker.logging.",
  },
  {
    pattern: /\blogger\.(info|warning|error|exception)\s*\(/,
    remediation:
      "Use worker_logger lifecycle helpers or structured WorkerLogger calls.",
  },
];
const PRODUCTION_PATHS = [
  "src/app",
  "src/lib",
  "src/services",
  "src/proxy.ts",
  "src/instrumentation.ts",
  "worker/src/starter_worker",
];
const EXCLUDED_PATHS = new Set([
  normalizePath("src/lib/logger.ts"),
  normalizePath("worker/src/starter_worker/logging.py"),
]);

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function isSourceFile(filePath) {
  return /\.(ts|tsx|py)$/.test(filePath);
}

function walk(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stats = fs.statSync(absolutePath);
  if (stats.isFile()) {
    return isSourceFile(relativePath) ? [normalizePath(relativePath)] : [];
  }

  const files = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name === "node_modules") {
      continue;
    }
    const child = normalizePath(path.join(relativePath, entry.name));
    files.push(...walk(root, child));
  }
  return files;
}

function getPatternsForFile(filePath) {
  if (filePath.endsWith(".py")) {
    return WORKER_PATTERNS;
  }
  return APP_PATTERNS;
}

export function scanLoggingGuard(options = {}) {
  const root = options.root ? path.resolve(options.root) : process.cwd();
  const candidateFiles =
    options.files?.map(normalizePath) ??
    PRODUCTION_PATHS.flatMap((productionPath) => walk(root, productionPath));
  const findings = [];

  for (const filePath of candidateFiles) {
    const normalized = normalizePath(filePath);
    if (EXCLUDED_PATHS.has(normalized)) {
      continue;
    }

    const absolutePath = path.join(root, normalized);
    if (!fs.existsSync(absolutePath) || !isSourceFile(normalized)) {
      continue;
    }

    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    const patterns = getPatternsForFile(normalized);
    lines.forEach((line, index) => {
      for (const rule of patterns) {
        if (rule.pattern.test(line)) {
          findings.push({
            path: normalized,
            line: index + 1,
            pattern: String(rule.pattern),
            remediation: rule.remediation,
          });
        }
      }
    });
  }

  return findings;
}

function main() {
  const rootArgIndex = process.argv.indexOf("--root");
  const root =
    rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
      ? process.argv[rootArgIndex + 1]
      : process.cwd();
  const findings = scanLoggingGuard({ root });

  if (findings.length === 0) {
    console.log("Logging guard passed.");
    return;
  }

  console.error("Logging guard found ad hoc production logging:");
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line} ${finding.remediation}`);
  }
  process.exitCode = 1;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  main();
}
