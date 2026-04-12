import { clearLine, cursorTo } from "node:readline";
import type { MatchAction } from "./types.js";

interface ProgressSnapshot {
  dryRun: boolean;
  pageNumber: number;
  totalPages: number;
  actions: MatchAction[];
  scannedCount?: number;
  openedCount?: number;
  totalMatchCount?: number;
  pageMatchIndex?: number;
  pageMatchCount?: number;
  currentMatchLabel?: string;
}

interface ProgressReporterOptions {
  plainText?: boolean;
}

function repeat(character: string, count: number): string {
  return character.repeat(Math.max(0, count));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function buildPageBar(pageNumber: number, totalPages: number, width: number): string {
  if (totalPages <= 0) {
    return `[${repeat("-", width)}]`;
  }

  const ratio = Math.min(1, Math.max(0, pageNumber / totalPages));
  const filled = Math.round(ratio * width);
  return `[${repeat("=", filled)}${repeat("-", width - filled)}]`;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRate(processed: number, elapsedMs: number): string {
  if (processed <= 0 || elapsedMs <= 0) {
    return "0.0/min";
  }

  const perMinute = (processed / elapsedMs) * 60_000;
  return `${perMinute.toFixed(1)}/min`;
}

function formatEta(scannedCount: number, totalCount: number, elapsedMs: number): string {
  if (totalCount <= 0 || scannedCount <= 0 || scannedCount >= totalCount || elapsedMs <= 0) {
    return "--:--";
  }

  const remaining = totalCount - scannedCount;
  const msPerItem = elapsedMs / scannedCount;
  return formatElapsed(remaining * msPerItem);
}

function summarizeActions(actions: MatchAction[]): {
  processed: number;
  approved: number;
  skipped: number;
  alreadyApproved: number;
  errors: number;
} {
  return {
    processed: actions.length,
    approved: actions.filter((action) => action.action === "approved").length,
    skipped: actions.filter((action) => action.action === "skipped").length,
    alreadyApproved: actions.filter((action) => action.action === "already-approved").length,
    errors: actions.filter((action) => action.action === "error").length
  };
}

function buildProgressLine(snapshot: ProgressSnapshot, terminalWidth: number, startedAt: number): string {
  const summary = summarizeActions(snapshot.actions);
  const barWidth = terminalWidth >= 170 ? 14 : terminalWidth >= 135 ? 12 : 8;
  const itemIndex = snapshot.pageMatchIndex ?? 0;
  const itemCount = snapshot.pageMatchCount ?? 0;
  const totalMatchCount = snapshot.totalMatchCount ?? 0;
  const elapsedMs = Date.now() - startedAt;
  const scannedCount = snapshot.scannedCount ?? summary.processed;
  const openedCount = snapshot.openedCount ?? 0;
  const totalBarCount = Math.max(totalMatchCount, Math.max(scannedCount, 1));
  const eta = formatEta(scannedCount, totalMatchCount, elapsedMs);
  const matchLabel = snapshot.currentMatchLabel ? ` | ${snapshot.currentMatchLabel}` : "";
  const line =
    `All ${buildPageBar(scannedCount, totalBarCount, barWidth)} ${scannedCount}/${totalMatchCount || "?"} ` +
    `| Pg ${buildPageBar(snapshot.pageNumber, snapshot.totalPages, barWidth)} ${snapshot.pageNumber}/${snapshot.totalPages} ` +
    `| It ${buildPageBar(itemCount > 0 ? itemIndex : 0, Math.max(itemCount, 1), barWidth)} ${itemIndex}/${itemCount} ` +
    `| Opened ${openedCount} ` +
    `| ${snapshot.dryRun ? "Would approve" : "Approved"} ${summary.approved} ` +
    `| Skipped ${summary.skipped} ` +
    `| Already ${summary.alreadyApproved} ` +
    `| Errors ${summary.errors} ` +
    `| ${formatRate(scannedCount, elapsedMs)} ` +
    `| ${formatElapsed(elapsedMs)} ` +
    `| ETA ${eta}` +
    matchLabel;

  return truncate(line, Math.max(40, terminalWidth - 1));
}

function buildPlainProgressLine(snapshot: ProgressSnapshot, startedAt: number): string {
  const summary = summarizeActions(snapshot.actions);
  const itemIndex = snapshot.pageMatchIndex ?? 0;
  const itemCount = snapshot.pageMatchCount ?? 0;
  const totalMatchCount = snapshot.totalMatchCount ?? 0;
  const elapsedMs = Date.now() - startedAt;
  const scannedCount = snapshot.scannedCount ?? summary.processed;
  const openedCount = snapshot.openedCount ?? 0;

  return [
    `Progress ${scannedCount}/${totalMatchCount || "?"}`,
    `page ${snapshot.pageNumber}/${snapshot.totalPages}`,
    `item ${itemIndex}/${itemCount}`,
    `opened ${openedCount}`,
    `${snapshot.dryRun ? "would-approve" : "approved"} ${summary.approved}`,
    `skipped ${summary.skipped}`,
    `already ${summary.alreadyApproved}`,
    `errors ${summary.errors}`,
    `${formatRate(scannedCount, elapsedMs)}`,
    `elapsed ${formatElapsed(elapsedMs)}`,
    `eta ${formatEta(scannedCount, totalMatchCount, elapsedMs)}`
  ].join(" | ");
}

export class ProgressReporter {
  private readonly plainText: boolean;
  private readonly enabled: boolean;
  private lastLine = "";
  private readonly startedAt = Date.now();
  private lastPlainKey = "";

  constructor(options: ProgressReporterOptions = {}) {
    this.plainText = Boolean(options.plainText);
    this.enabled = this.plainText || Boolean(process.stdout.isTTY);
  }

  update(snapshot: ProgressSnapshot): void {
    if (!this.enabled) {
      return;
    }

    if (this.plainText) {
      this.updatePlain(snapshot);
      return;
    }

    const columns = process.stdout.columns ?? 120;
    const line = buildProgressLine(snapshot, columns, this.startedAt);
    if (line === this.lastLine) {
      return;
    }

    this.clearCurrentLine();
    process.stdout.write(line);
    this.lastLine = line;
  }

  log(message: string): void {
    if (!this.enabled) {
      console.log(message);
      return;
    }

    this.clearCurrentLine();
    console.log(message);
    if (this.lastLine) {
      process.stdout.write(this.lastLine);
    }
  }

  finish(): void {
    if (!this.enabled || !this.lastLine) {
      if (this.plainText) {
        this.lastPlainKey = "";
      }
      return;
    }

    this.clearCurrentLine();
    process.stdout.write(this.lastLine);
    process.stdout.write("\n");
    this.lastLine = "";
  }

  private clearCurrentLine(): void {
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
  }

  private updatePlain(snapshot: ProgressSnapshot): void {
    const plainKey = [
      snapshot.scannedCount ?? "",
      snapshot.pageNumber,
      snapshot.pageMatchIndex ?? "",
      snapshot.totalMatchCount ?? ""
    ].join("|");

    if (plainKey === this.lastPlainKey) {
      return;
    }

    console.log(buildPlainProgressLine(snapshot, this.startedAt));
    this.lastPlainKey = plainKey;
  }
}
