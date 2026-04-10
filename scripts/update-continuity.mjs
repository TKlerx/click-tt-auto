import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const checkOnly = process.argv.includes("--check");
const continuePath = path.join(repoRoot, "CONTINUE.md");
const continueLogPath = path.join(repoRoot, "CONTINUE_LOG.md");
const continuityFiles = new Set(["CONTINUE.md", "CONTINUE_LOG.md"]);

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

function formatNow() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getBranch() {
  return safeRunGit(["branch", "--show-current"]) || "unknown";
}

function getStatusLines() {
  const output = safeRunGit(["status", "--short"]);
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => {
      const normalized = line.slice(3).replace(/\\/g, "/");
      return !continuityFiles.has(normalized);
    });
}

function getRecentNonContinuityCommits(limit = 5) {
  const logOutput = safeRunGit(["log", "--pretty=format:%H%x09%s", "-n", "25"]);
  if (!logOutput) {
    return [];
  }

  const commits = [];
  for (const line of logOutput.split(/\r?\n/)) {
    const [hash, subject] = line.split("\t");
    if (!hash || !subject) {
      continue;
    }

    const filesOutput = safeRunGit(["show", "--pretty=format:", "--name-only", hash]);
    const files = filesOutput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const onlyContinuityChanges =
      files.length > 0 && files.every((file) => continuityFiles.has(file));

    if (!onlyContinuityChanges) {
      commits.push({ hash, subject });
    }

    if (commits.length >= limit) {
      break;
    }
  }

  return commits;
}

function getActiveSpecs(branch, statusLines) {
  const specs = new Set();
  const branchPrefix = branch.match(/^(\d{3})(?:[-_].+)?$/);
  const specsDir = path.join(repoRoot, "specs");
  const existingSpecDirs = new Set();

  if (existsSync(specsDir)) {
    for (const entry of readdirSync(specsDir)) {
      const entryPath = path.join(specsDir, entry);
      if (statSync(entryPath).isDirectory()) {
        existingSpecDirs.add(entry);
      }
    }
  }

  if (branchPrefix) {
    for (const entry of existingSpecDirs) {
      if (entry.startsWith(branchPrefix[1])) {
        specs.add(entry);
      }
    }
  }

  for (const line of statusLines) {
    const match = line.match(/specs\/([^/]+)/) || line.match(/specs\\([^\\]+)/);
    if (match?.[1] && existingSpecDirs.has(match[1])) {
      specs.add(match[1]);
    }
  }

  return [...specs].sort();
}

function parseNextTasks(specs) {
  const items = [];

  for (const spec of specs) {
    const tasksPath = path.join(repoRoot, "specs", spec, "tasks.md");
    if (!existsSync(tasksPath)) {
      continue;
    }

    const lines = readFileSync(tasksPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^- \[ \] (T\d+[A-Za-z0-9]*) (.+)$/);
      if (match) {
        items.push({
          spec,
          id: match[1],
          description: match[2],
        });
      }
      if (items.length >= 5) {
        return items;
      }
    }
  }

  return items;
}

function summarizeStatus(statusLines) {
  if (statusLines.length === 0) {
    return ["Working tree is clean."];
  }

  return statusLines.map((line) => `- ${line}`);
}

function buildContinueContent({
  branch,
  timestamp,
  recentCommits,
  statusLines,
  activeSpecs,
  nextTasks,
  fingerprint,
}) {
  const recentCommitLines =
    recentCommits.length > 0
      ? recentCommits.map((commit) => `- ${commit.hash.slice(0, 7)} ${commit.subject}`)
      : ["- No recent non-continuity commits found."];

  const activeSpecLines =
    activeSpecs.length > 0
      ? activeSpecs.map((spec) => `- ${spec}`)
      : ["- No active spec folders detected."];

  const nextTaskLines =
    nextTasks.length > 0
      ? nextTasks.map((task, index) => `${index + 1}. ${task.spec}: ${task.id} ${task.description}`)
      : ["1. No unchecked tasks detected in the active specs."];

  return [
    "# Continue",
    "",
    `<!-- continuity:fingerprint=${fingerprint} -->`,
    "",
    "## Current Snapshot",
    "",
    `- Updated: ${timestamp}`,
    `- Branch: \`${branch}\``,
    "",
    "## Recent Non-Continuity Commits",
    "",
    ...recentCommitLines,
    "",
    "## Git Status",
    "",
    ...summarizeStatus(statusLines),
    "",
    "## Active Specs",
    "",
    ...activeSpecLines,
    "",
    "## Next Recommended Actions",
    "",
    ...nextTaskLines,
    "",
  ].join("\n");
}

function extractPreviousFingerprint(content) {
  const match = content.match(/<!-- continuity:fingerprint=([a-f0-9]+) -->/);
  return match?.[1] ?? "";
}

function buildNextLogContent({ existingLogContent, previousFingerprint, nextFingerprint, branch, timestamp, recentCommits, activeSpecs, nextTasks }) {
  const existing = existingLogContent.trimEnd();
  if (previousFingerprint === nextFingerprint) {
    return existing ? `${existing}\n` : "";
  }

  const summaryCommit = recentCommits[0] ? `${recentCommits[0].hash.slice(0, 7)} ${recentCommits[0].subject}` : "No recent non-continuity commits";
  const summarySpec = activeSpecs.length > 0 ? activeSpecs.join(", ") : "none";
  const summaryNext = nextTasks[0] ? `${nextTasks[0].spec}: ${nextTasks[0].id}` : "no next task";

  const entry = [
    "",
    `## ${timestamp}`,
    "",
    `- Branch snapshot refreshed for \`${branch}\`.`,
    `- Latest non-continuity commit: ${summaryCommit}.`,
    `- Active specs: ${summarySpec}.`,
    `- Next focus: ${summaryNext}.`,
  ].join("\n");

  return `${existing}${entry}\n`;
}

const branch = getBranch();
const statusLines = getStatusLines();
const recentCommits = getRecentNonContinuityCommits();
const activeSpecs = getActiveSpecs(branch, statusLines);
const nextTasks = parseNextTasks(activeSpecs);
const materialState = JSON.stringify({
  branch,
  recentCommits,
  activeSpecs,
  nextTasks,
  statusSummary: statusLines,
});
const fingerprint = createHash("sha256").update(materialState).digest("hex");
const previousContent = existsSync(continuePath) ? readFileSync(continuePath, "utf8") : "";
const previousLogContent = existsSync(continueLogPath) ? readFileSync(continueLogPath, "utf8") : "";
const previousFingerprint = extractPreviousFingerprint(previousContent);
const timestamp = previousFingerprint === fingerprint && previousContent
  ? previousContent.match(/^- Updated: (.+)$/m)?.[1] ?? formatNow()
  : formatNow();

const nextContent = buildContinueContent({
  branch,
  timestamp,
  recentCommits,
  statusLines,
  activeSpecs,
  nextTasks,
  fingerprint,
});

const nextLogContent = buildNextLogContent({
  existingLogContent: previousLogContent || "# Continue Log\n",
  previousFingerprint,
  nextFingerprint: fingerprint,
  branch,
  timestamp,
  recentCommits,
  activeSpecs,
  nextTasks,
});

if (checkOnly) {
  const changedFiles = [];
  if (previousContent !== nextContent) {
    changedFiles.push("CONTINUE.md");
  }
  if (previousLogContent !== nextLogContent) {
    changedFiles.push("CONTINUE_LOG.md");
  }

  if (changedFiles.length > 0) {
    console.error(changedFiles.join("\n"));
    process.exitCode = 1;
  }
} else {
  if (previousContent !== nextContent) {
    writeFileSync(continuePath, nextContent, "utf8");
  }

  if (previousLogContent !== nextLogContent) {
    writeFileSync(continueLogPath, nextLogContent, "utf8");
  }
}
