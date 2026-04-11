import fs from "node:fs/promises";
import path from "node:path";
import type { MatchAction, RunReport } from "./types.js";

function actionReason(action: MatchAction): string {
  if (action.error) {
    return action.error;
  }

  const failedChecks = action.validation?.checks.filter((check) => !check.passed) ?? [];
  return failedChecks.map((check) => check.reason).filter(Boolean).join("; ") || "no reason recorded";
}

export function buildRunReport(input: {
  dryRun: boolean;
  group: string | null;
  actions: MatchAction[];
  timestamp?: string;
}): RunReport {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const totals = {
    totalFound: input.actions.length,
    totalApproved: input.actions.filter((action) => action.action === "approved").length,
    totalSkipped: input.actions.filter((action) => action.action === "skipped").length,
    totalAlreadyApproved: input.actions.filter((action) => action.action === "already-approved").length,
    totalErrors: input.actions.filter((action) => action.action === "error").length
  };

  return {
    timestamp,
    dryRun: input.dryRun,
    group: input.group,
    actions: input.actions,
    ...totals
  };
}

export async function writeRunReport(report: RunReport, reportDir: string): Promise<string> {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = report.timestamp.replace(/[:.]/g, "").replace(/-/g, "");
  const reportPath = path.join(reportDir, `report-${timestamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

export function formatStdoutReport(report: RunReport): string {
  const skipped = report.actions.filter((action) => action.action === "skipped");
  const lines = [
    "click-TT Match Auto-Approval",
    "============================",
    `Mode: ${report.dryRun ? "DRY RUN" : "LIVE"}`,
    `Group: ${report.group ?? "Alle meine Gruppen"}`,
    `Date: ${report.timestamp}`,
    "",
    "Summary:",
    `  Total found:      ${report.totalFound}`,
    `  Approved:         ${report.totalApproved}`,
    `  Skipped:          ${report.totalSkipped}`,
    `  Already approved: ${report.totalAlreadyApproved}`,
    `  Errors:           ${report.totalErrors}`
  ];

  if (skipped.length > 0) {
    lines.push("", "Skipped matches:");
    skipped.forEach((action, index) => {
      lines.push(`  ${index + 1}. ${action.match.homeTeam} vs ${action.match.guestTeam} (${action.match.date}) - ${actionReason(action)}`);
    });
  }

  if (report.reportPath) {
    lines.push("", `Report saved to: ${report.reportPath}`);
  }

  return lines.join("\n");
}
