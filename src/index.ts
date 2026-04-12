import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { handleApproval } from "./approver.js";
import { ensureSessionActive, login } from "./auth.js";
import { loadConfig } from "./config.js";
import { getStatusFineCandidateState, loadFineWorkbookIndex, syncFineWorkbook } from "./fines.js";
import { assertMatchListPage, findMatchLink, goToNextPage, readMatchListPage } from "./match-list.js";
import { readMatchDetailPage } from "./match-detail.js";
import { navigateToMatchSearch } from "./navigation.js";
import { ProgressReporter } from "./progress.js";
import { buildRunReport, formatStdoutReport, writeRunReport } from "./reporter.js";
import type { MatchAction, MatchEntry } from "./types.js";
import { validateMatch } from "./validator.js";

function formatAction(prefix: string, match: MatchEntry, reason?: string): string {
  const tail = reason ? ` - ${reason}` : "";
  return `${prefix} ${match.homeTeam} vs ${match.guestTeam} (${match.date})${tail}`;
}

function formatMatchLabel(match: MatchEntry): string {
  return `${match.homeTeam} vs ${match.guestTeam} (${match.date})`;
}

function shouldInspectMatch(match: MatchEntry): boolean {
  return match.status.toLowerCase() === "abgeschlossen" && !match.isApproved;
}

function shouldCreateStatusFine(match: MatchEntry): boolean {
  return match.status.toLowerCase() === "nicht angetreten";
}

function shouldTrackStatusFine(state: "disabled" | "missing" | "existing" | "ignored"): boolean {
  return state === "missing";
}

function createSafeSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "match";
}

async function captureDetailHtmlSnapshot(
  page: Page,
  reportDir: string,
  match: MatchEntry
): Promise<string> {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace(/-/g, "");
  const fileName = `debug-detail-${timestamp}-${createSafeSlug(`${match.homeTeam}-vs-${match.guestTeam}`)}.html`;
  const filePath = path.join(reportDir, fileName);
  await fs.writeFile(filePath, await page.content(), "utf8");
  return filePath;
}

function getImpossibleCountMessage(match: MatchEntry, homeCount: number, guestCount: number): string | null {
  const impossibleCounts: string[] = [];

  if (homeCount > 6) {
    impossibleCounts.push(`${match.homeTeam}: ${homeCount}`);
  }

  if (guestCount > 6) {
    impossibleCounts.push(`${match.guestTeam}: ${guestCount}`);
  }

  if (impossibleCounts.length > 0) {
    return (
      `Impossible player count detected for ${match.homeTeam} vs ${match.guestTeam} (${match.date}). ` +
        `This usually means the detail page was parsed incorrectly. Counts: ${impossibleCounts.join(", ")}`
    );
  }

  return null;
}

function isFatalDetailPageError(message: string): boolean {
  return /^Impossible player count detected\b/.test(message) || /^Expected detail page fields missing:/.test(message);
}

async function assertReasonablePlayerCounts(
  page: Page,
  reportDir: string,
  match: MatchEntry,
  homeCount: number,
  guestCount: number
): Promise<void> {
  const message = getImpossibleCountMessage(match, homeCount, guestCount);
  if (!message) {
    return;
  }

  const snapshotPath = await captureDetailHtmlSnapshot(page, reportDir, match);
  throw new Error(`${message}. Detail HTML saved to: ${snapshotPath}`);
}

async function pauseForInspection(reason: string): Promise<void> {
  console.error("");
  console.error(`HALTED: ${reason}`);
  console.error("Browser left open for inspection. Press Enter in this terminal to close it.");

  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  // Discard any buffered newline so we wait for an explicit fresh Enter press.
  while (process.stdin.read() !== null) {
    // Keep draining buffered input.
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await rl.question("");
  } finally {
    rl.close();
    process.stdin.pause();
  }
}

async function run(): Promise<void> {
  const config = loadConfig();
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMoMs
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const actions: MatchAction[] = [];
  const processedKeys = new Set<string>();
  const statusFineKeys = new Set<string>();
  const statusFineMatches: MatchEntry[] = [];
  const progress = new ProgressReporter({ plainText: config.plainProgress });
  let haltReason: string | null = null;
  let totalMatchCount = 0;
  let scannedCount = 0;
  let openedCount = 0;
  let fineWorkbookIndex = { enabled: false, existingKeys: new Set<string>(), ignoredKeys: new Set<string>() };

  const fineLookupOptions = {
    defaultLiga: config.fineLiga,
    defaultGruppe: config.fineGruppe,
    spielleiter: config.fineSpielleiter,
    naKosten: config.fineNaKosten
  };

  try {
    const modeSuffix = [
      config.dryRun ? "DRY RUN" : null,
      config.debug ? "DEBUG" : null,
      config.plainProgress ? "PLAIN PROGRESS" : null,
      config.slowMoMs > 0 ? `SLOW ${config.slowMoMs}ms` : null
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(`click-TT Match Auto-Approval${modeSuffix ? ` [${modeSuffix}]` : ""}`);
    if (config.fineWorkbookPath) {
      try {
        fineWorkbookIndex = await loadFineWorkbookIndex({
          workbookPath: config.fineWorkbookPath,
          sheetName: config.fineSheetName,
          ignoreColumnName: config.fineIgnoreColumn
        });
      } catch {
        fineWorkbookIndex = { enabled: false, existingKeys: new Set<string>(), ignoredKeys: new Set<string>() };
      }
    }
    console.log("Logging in...");
    await login(page, config.baseUrl, config.username, config.password);
    console.log("Navigating to Begegnungen...");
    await navigateToMatchSearch(page, config.group, {
      onlyUnapproved: !config.fineWorkbookPath
    });

    let pageNumber = 1;
    let totalPages = 1;

    while (true) {
      await ensureSessionActive(page);
      await assertMatchListPage(page);
      const parsedPage = await readMatchListPage(page);
      totalPages = parsedPage.pagination.totalPages;
      totalMatchCount = Math.max(totalMatchCount, parsedPage.totalMatches);

      const pageMatchCount = parsedPage.allMatches.length;

      progress.update({
        dryRun: config.dryRun,
        pageNumber,
        totalPages,
        actions,
        scannedCount,
        openedCount,
        totalMatchCount,
        pageMatchIndex: 0,
        pageMatchCount
      });

      for (const [matchIndex, match] of parsedPage.allMatches.entries()) {
        scannedCount += 1;
        const matchKey = `${match.date}|${match.homeTeam}|${match.guestTeam}|${match.group}`;
        const statusFineState = shouldCreateStatusFine(match)
          ? getStatusFineCandidateState(match, fineWorkbookIndex, fineLookupOptions)
          : "disabled";
        const trackStatusFine = shouldTrackStatusFine(statusFineState);
        const needsStatusFineDetail = shouldCreateStatusFine(match) && statusFineState === "missing" && Boolean(config.fineWorkbookPath);
        const needsDetailVisit = shouldInspectMatch(match) || needsStatusFineDetail;

        if (!needsDetailVisit || processedKeys.has(matchKey)) {
          if (trackStatusFine && !statusFineKeys.has(matchKey)) {
            statusFineKeys.add(matchKey);
            statusFineMatches.push(match);
          }

          progress.update({
            dryRun: config.dryRun,
            pageNumber,
            totalPages,
            actions,
            scannedCount,
            openedCount,
            totalMatchCount,
            pageMatchIndex: matchIndex + 1,
            pageMatchCount,
            currentMatchLabel: formatMatchLabel(match)
          });
          continue;
        }
        processedKeys.add(matchKey);

        const link = await findMatchLink(page, match);
        if (!link || (await link.count()) === 0) {
          if (trackStatusFine && !statusFineKeys.has(matchKey)) {
            statusFineKeys.add(matchKey);
            statusFineMatches.push(match);
          }

          if (shouldInspectMatch(match)) {
            const action: MatchAction = { match, action: "error", error: "Match link not found on current list page" };
            actions.push(action);
            progress.log(formatAction("[ERROR]", match, action.error));
          }

          progress.update({
            dryRun: config.dryRun,
            pageNumber,
            totalPages,
            actions,
            scannedCount,
            openedCount,
            totalMatchCount,
            pageMatchIndex: matchIndex + 1,
            pageMatchCount,
            currentMatchLabel: formatMatchLabel(match)
          });
          continue;
        }

        try {
          await Promise.all([page.waitForLoadState("domcontentloaded"), link.click()]);
          await ensureSessionActive(page);
          openedCount += 1;

          const detail = await readMatchDetailPage(page, {
            homeTeam: match.homeTeam,
            guestTeam: match.guestTeam
          });
          if (detail.competitionName) {
            match.group = detail.competitionName;
          }
          if (detail.competitionLiga) {
            match.liga = detail.competitionLiga;
          }
          if (detail.competitionGruppe !== undefined) {
            match.gruppe = detail.competitionGruppe;
          }

          if (needsStatusFineDetail && !statusFineKeys.has(matchKey)) {
            statusFineKeys.add(matchKey);
            statusFineMatches.push(match);
          }

          if (!shouldInspectMatch(match)) {
            await handleApproval(page, true, false);
            progress.update({
              dryRun: config.dryRun,
              pageNumber,
              totalPages,
              actions,
              scannedCount,
              openedCount,
              totalMatchCount,
              pageMatchIndex: matchIndex + 1,
              pageMatchCount,
              currentMatchLabel: formatMatchLabel(match)
            });
            continue;
          }
          await assertReasonablePlayerCounts(
            page,
            config.reportDir,
            match,
            detail.homeTeam.playerCount,
            detail.guestTeam.playerCount
          );
          const validation = validateMatch(match, detail);

          if (detail.isAlreadyApproved) {
            const action: MatchAction = { match, action: "already-approved", validation };
            actions.push(action);
            await handleApproval(page, true, false);
            progress.update({
              dryRun: config.dryRun,
              pageNumber,
              totalPages,
              actions,
              scannedCount,
              openedCount,
              totalMatchCount,
              pageMatchIndex: matchIndex + 1,
              pageMatchCount,
              currentMatchLabel: formatMatchLabel(match)
            });
            continue;
          }

          if (!validation.isApprovable) {
            const action: MatchAction = { match, action: "skipped", validation };
            actions.push(action);
            await handleApproval(page, true, false);
            progress.update({
              dryRun: config.dryRun,
              pageNumber,
              totalPages,
              actions,
              scannedCount,
              totalMatchCount,
              pageMatchIndex: matchIndex + 1,
              pageMatchCount,
              currentMatchLabel: formatMatchLabel(match)
            });
            continue;
          }

          await handleApproval(page, config.dryRun, true);
          const action: MatchAction = { match, action: "approved", validation };
          actions.push(action);
          progress.update({
            dryRun: config.dryRun,
            pageNumber,
            totalPages,
            actions,
            scannedCount,
            openedCount,
            totalMatchCount,
            pageMatchIndex: matchIndex + 1,
            pageMatchCount,
            currentMatchLabel: formatMatchLabel(match)
          });
        } catch (error) {
          let message = error instanceof Error ? error.message : String(error);
          const isFatalDetailError = isFatalDetailPageError(message);

          if (isFatalDetailError && !/Detail HTML saved to:/i.test(message)) {
            const snapshotPath = await captureDetailHtmlSnapshot(page, config.reportDir, match);
            message = `${message}. Detail HTML saved to: ${snapshotPath}`;
          }

          if (isFatalDetailError && config.haltOnError) {
            throw new Error(message);
          }

          if (trackStatusFine && !statusFineKeys.has(matchKey)) {
            statusFineKeys.add(matchKey);
            statusFineMatches.push(match);
          }

          if (needsDetailVisit) {
            const action: MatchAction = { match, action: "error", error: message };
            actions.push(action);
            progress.log(formatAction("[ERROR]", match, message));
          }

          progress.update({
            dryRun: config.dryRun,
            pageNumber,
            totalPages,
            actions,
            scannedCount,
            openedCount,
            totalMatchCount,
            pageMatchIndex: matchIndex + 1,
            pageMatchCount,
            currentMatchLabel: formatMatchLabel(match)
          });

          try {
            const cancelButton = page.getByRole("button", { name: /abbrechen/i }).first();
            if ((await cancelButton.count()) > 0) {
              await Promise.all([page.waitForLoadState("domcontentloaded"), cancelButton.click()]);
            }
          } catch {
            // Best effort only. The loop will fail fast if the page cannot recover.
          }
        }
      }

      if (pageNumber >= totalPages) {
        break;
      }

      const advanced = await goToNextPage(page, pageNumber, {
        debug: config.debug,
        reportDir: config.reportDir
      });
      if (!advanced) {
        break;
      }
      pageNumber += 1;
      await assertMatchListPage(page);
    }

    const report = buildRunReport({
      dryRun: config.dryRun,
      group: config.group,
      actions,
      totalFound: totalMatchCount || scannedCount,
      totalScanned: scannedCount,
      totalOpened: openedCount
    });

    try {
      report.fineSync = await syncFineWorkbook({
        workbookPath: config.fineWorkbookPath,
        sheetName: config.fineSheetName,
        ignoreColumnName: config.fineIgnoreColumn,
        spielleiter: config.fineSpielleiter,
        defaultLiga: config.fineLiga,
        defaultGruppe: config.fineGruppe,
        naKosten: config.fineNaKosten,
        dryRun: config.dryRun,
        actions,
        statusFineMatches
      });
    } catch (error) {
      report.fineSync = {
        enabled: true,
        totalCandidates: 0,
        appended: 0,
        existing: 0,
        ignored: 0,
        ...(config.fineWorkbookPath ? { workbookPath: config.fineWorkbookPath } : {}),
        error: error instanceof Error ? error.message : String(error)
      };
    }

    report.reportPath = await writeRunReport(report, config.reportDir);
    progress.finish();
    console.log("");
    console.log(formatStdoutReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (config.haltOnError && config.headed) {
      haltReason = message;
    } else {
      throw error;
    }
  } finally {
    progress.finish();
    if (haltReason) {
      await pauseForInspection(haltReason);
    }
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
