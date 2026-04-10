import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const specsDir = path.join(repoRoot, "specs");
const overviewPath = path.join(specsDir, "OVERVIEW.md");
const checkOnly = process.argv.includes("--check");

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function listFeatureDirs() {
  if (!existsSync(specsDir)) {
    return [];
  }

  return readdirSync(specsDir)
    .filter((name) => /^\d{3}-/.test(name) && name !== "main")
    .map((name) => {
      const fullPath = path.join(specsDir, name);
      return statSync(fullPath).isDirectory() ? { name, fullPath } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function titleFromFolder(name) {
  return name
    .replace(/^\d{3}-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractTitle(specContent, fallback) {
  const titleMatch = specContent.match(/^# Feature Specification:\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : fallback;
}

function countTasks(tasksContent) {
  const total = (tasksContent.match(/^- \[(?: |x|X)\] /gm) ?? []).length;
  const checked = (tasksContent.match(/^- \[(?:x|X)\] /gm) ?? []).length;
  return { total, checked, unchecked: total - checked };
}

function extractDependency(specContent, planContent) {
  for (const source of [planContent, specContent]) {
    for (const line of source.split(/\r?\n/)) {
      if (!/depends on/i.test(line)) {
        continue;
      }

      const cleaned = line
        .replace(/^[\-\*\d\.\s`]+/, "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/^Depends on\s*:?\s*/i, "")
        .trim();

      if (cleaned) {
        return cleaned;
      }
    }
  }

  return "-";
}

function inferStatus(files, taskCounts) {
  if (files.tasks && taskCounts.total > 0) {
    if (taskCounts.checked === 0) {
      return "Tasked";
    }
    if (taskCounts.checked === taskCounts.total) {
      return "Fully Implemented";
    }
    if (taskCounts.checked >= Math.ceil(taskCounts.total / 2)) {
      return "Partially Implemented";
    }
    return "In Progress";
  }

  if (files.plan || files.dataModel) {
    return "Analyzed";
  }

  if (files.research) {
    return "Analyzed";
  }

  if (files.clarify) {
    return "Clarified";
  }

  return "Planned";
}

function estimateEffort(taskCounts, status) {
  if (taskCounts.total > 0) {
    if (taskCounts.total <= 8) return "Small";
    if (taskCounts.total <= 20) return "Medium";
    return "Large";
  }

  switch (status) {
    case "Planned":
      return "Spec refinement";
    case "Clarified":
      return "Analysis prep";
    case "Analyzed":
      return "Task planning";
    default:
      return "Unknown";
  }
}

function nextStep(status) {
  switch (status) {
    case "Planned":
      return "Run `/speckit.clarify`";
    case "Clarified":
      return "Run `/speckit.analyze`";
    case "Analyzed":
      return "Run `/speckit.plan` and `/speckit.tasks`";
    case "Tasked":
      return "Start implementation with `/speckit.implement`";
    case "In Progress":
    case "Partially Implemented":
      return "Continue implementation and complete the remaining tasks";
    case "Fully Implemented":
      return "Review, commit, and propagate the finished feature";
    default:
      return "Review the feature status";
  }
}

function summarizeFeature(dir) {
  const files = {
    spec: existsSync(path.join(dir.fullPath, "spec.md")),
    clarify: existsSync(path.join(dir.fullPath, "clarify.md")),
    research: existsSync(path.join(dir.fullPath, "research.md")),
    plan: existsSync(path.join(dir.fullPath, "plan.md")),
    dataModel: existsSync(path.join(dir.fullPath, "data-model.md")),
    tasks: existsSync(path.join(dir.fullPath, "tasks.md")),
  };

  const specContent = readIfExists(path.join(dir.fullPath, "spec.md"));
  const planContent = readIfExists(path.join(dir.fullPath, "plan.md"));
  const tasksContent = readIfExists(path.join(dir.fullPath, "tasks.md"));
  const taskCounts = countTasks(tasksContent);
  const status = inferStatus(files, taskCounts);

  return {
    number: dir.name.slice(0, 3),
    title: extractTitle(specContent, titleFromFolder(dir.name)),
    status,
    dependsOn: extractDependency(specContent, planContent),
    effort: estimateEffort(taskCounts, status),
    nextStep: nextStep(status),
  };
}

function buildRoadmap(features) {
  const complete = features.filter((feature) => feature.status === "Fully Implemented");
  const immediate = features.filter((feature) => ["In Progress", "Partially Implemented", "Tasked"].includes(feature.status));
  const blocked = features.filter((feature) => ["Planned", "Clarified", "Analyzed"].includes(feature.status));

  return [
    "## Implementation Roadmap",
    "",
    "### Complete",
    "",
    ...(complete.length > 0
      ? complete.map((feature) => `- ${feature.number} ${feature.title}: fully implemented`)
      : ["- No numbered features are fully implemented yet"]),
    "",
    "### Begin Immediately",
    "",
    ...(immediate.length > 0
      ? immediate.map((feature) => `- ${feature.number} ${feature.title}: ${feature.nextStep}`)
      : ["- No tasked or in-progress numbered features are waiting for implementation work"]),
    "",
    "### Blocked / Prep Needed",
    "",
    ...(blocked.length > 0
      ? blocked.map((feature) => `- ${feature.number} ${feature.title}: ${feature.nextStep}`)
      : ["- No planned features are blocked on clarify/analyze/planning work"]),
    "",
  ].join("\n");
}

function buildOverview(features) {
  const today = new Date().toISOString().slice(0, 10);

  return [
    "# click-TT Automation Specs Overview",
    "",
    `Last Updated: ${today}`,
    "",
    "Purpose: Track the status of all planned features, their implementation progress, and next steps.",
    "",
    "## Status Legend",
    "",
    "| Status | Meaning | Expected Artifacts |",
    "| --- | --- | --- |",
    "| Planned | The feature intent is captured, but no clarification work has been recorded yet. | `spec.md` only |",
    "| Clarified | The open scope and decision questions have been resolved. | `spec.md` + `clarify.md` |",
    "| Analyzed | The feature has been researched enough to support planning. | `spec.md` + `clarify.md` + `research.md` |",
    "| Tasked | The feature has a concrete execution plan and task list, but no implementation tasks are checked yet. | `spec.md` + `clarify.md` + `research.md` + `plan.md` + `data-model.md` + `tasks.md` |",
    "| In Progress | Implementation has started and some tasks are checked. | `tasks.md` exists and some tasks are checked |",
    "| Partially Implemented | Core work appears implemented, but tasks remain unchecked. | Major stories implemented, but tasks remain unchecked |",
    "| Fully Implemented | All tasks are checked and validation/testing is recorded as complete. | All tasks checked and validation/testing noted as complete |",
    "",
    "## Specs Summary",
    "",
    "| # | Feature | Status | Depends On | Est. Effort | Next Step |",
    "| --- | --- | --- | --- | --- | --- |",
    ...features.map(
      (feature) =>
        `| ${feature.number} | ${feature.title} | ${feature.status} | ${feature.dependsOn} | ${feature.effort} | ${feature.nextStep} |`
    ),
    "",
    buildRoadmap(features),
  ].join("\n");
}

const features = listFeatureDirs().map(summarizeFeature);
const nextOverview = buildOverview(features);
const previousOverview = readIfExists(overviewPath);

if (checkOnly) {
  if (previousOverview !== nextOverview) {
    console.error("specs/OVERVIEW.md");
    process.exitCode = 1;
  }
} else if (previousOverview !== nextOverview) {
  writeFileSync(overviewPath, nextOverview, "utf8");
}
