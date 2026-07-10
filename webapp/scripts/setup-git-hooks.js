#!/usr/bin/env node

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const gitDir = path.join(repoRoot, ".git");
const hooksDir = path.join(repoRoot, ".githooks");

if (!fs.existsSync(gitDir) || !fs.existsSync(hooksDir)) {
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .githooks", {
    cwd: repoRoot,
    stdio: "ignore",
  });
  process.stdout.write("Configured git hooks to use .githooks\n");
} catch {
  process.exit(0);
}
