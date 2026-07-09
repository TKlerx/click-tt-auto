import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const originFilePath = path.join(repoRoot, ".template-origin.json");
const versionFilePath = path.join(repoRoot, "TEMPLATE_VERSION.md");
const checkOnly = process.argv.includes("--check");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function safeRunGit(args) {
  try {
    return runGit(args);
  } catch {
    return "";
  }
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const repoUrl = runGit(["remote", "get-url", "starter"]);
const currentBranch = runGit(["branch", "--show-current"]) || "main";
const remoteHeadRef =
  safeRunGit(["ls-remote", "--symref", "starter", "HEAD"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("ref:")) ?? "";
const remoteDefaultBranch =
  remoteHeadRef.match(/refs\/heads\/([^\s]+)/)?.[1] ?? "";
const existingOrigin = JSON.parse(readFileSync(originFilePath, "utf8"));
const defaultBranch =
  remoteDefaultBranch || existingOrigin.templateDefaultBranch || "main";
const commit = runGit(["rev-parse", "HEAD"]);
const shortCommit = runGit(["rev-parse", "--short", "HEAD"]);
const recordedAt = formatDate(new Date());
const versionLabel =
  currentBranch === defaultBranch
    ? `${defaultBranch}@${shortCommit}`
    : `${defaultBranch}+${currentBranch}@${shortCommit}`;

const origin = existingOrigin;
origin.templateRepoUrl = repoUrl;
origin.templateDefaultBranch = defaultBranch;
origin.recordedUpstreamTemplateCommit = commit;
origin.recordedUpstreamTemplateShortCommit = shortCommit;
origin.templateRecordedAt = recordedAt;
origin.templateVersionLabel = versionLabel;
const nextOriginContent = `${JSON.stringify(origin, null, 2)}\n`;

const versionFile = `# Template Version

- Template repo: \`${repoUrl}\`
- Default branch: \`${defaultBranch}\`
- Recorded upstream template commit: \`${commit}\`
- Short commit: \`${shortCommit}\`
- Recorded at: \`${recordedAt}\`
- Version label: \`${versionLabel}\`

## Purpose

This file gives humans a quick way to see which upstream template revision this repository is recorded against.

For machine-readable tooling and downstream propagation, also see \`.template-origin.json\`.

Because commit hashes are self-referential, a repository cannot permanently store its own exact current commit hash inside the same commit without changing that hash. The practical pattern is to record the latest known upstream baseline and refresh it after pulling template updates.

## Downstream Usage

When a product app is created from this template, keep both \`TEMPLATE_VERSION.md\` and \`.template-origin.json\`.

Then run:

\`\`\`powershell
pnpm run template:stamp
\`\`\`

When the app later pulls in upstream template fixes:

1. Apply the upstream template change.
2. Run \`pnpm run template:stamp\`.
3. Commit the updated \`.template-origin.json\` and \`TEMPLATE_VERSION.md\`.

That gives each downstream app a visible and scriptable record of the template version it is based on.
`;

if (checkOnly) {
  const currentOriginContent = readFileSync(originFilePath, "utf8");
  const currentVersionFile = readFileSync(versionFilePath, "utf8");

  if (
    currentOriginContent !== nextOriginContent ||
    currentVersionFile !== versionFile
  ) {
    process.exitCode = 1;
  }
} else {
  writeFileSync(originFilePath, nextOriginContent, "utf8");
  writeFileSync(versionFilePath, versionFile, "utf8");
}
