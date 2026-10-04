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
import { readMatchDetailPage, waitForMatchDetailPage } from "./match-detail.js";
import { cancelAndReturn, navigateToMatchSearch } from "./navigation.js";
import { ProgressReporter } from "./progress.js";
import { buildRunReport, formatStdoutReport, writeRunReport } from "./reporter.js";
import type { MatchAction, MatchEntry } from "./types.js";
import { validateMatch } from "./validator.js";
import { isSessionExpiredError } from "./session-recovery.js";

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

function shouldVisitMatchDetail(processAll: boolean, match: MatchEntry, needsStatusFineDetail: boolean): boolean {
  return processAll || shouldInspectMatch(match) || needsStatusFineDetail;
}

function shouldCreateStatusFine(match: MatchEntry): boolean {
  return match.status.toLowerCase() === "nicht angetreten";
}

function reconcilePendingApproval(
  pendingApprovals: Map<string, MatchAction>,
  matchKey: string,
  isApproved: boolean,
  recordAction: (matchKey: string, action: MatchAction) => void
): void {
  const recoveredApproval = pendingApprovals.get(matchKey);
  if (recoveredApproval && isApproved) {
    recordAction(matchKey, recoveredApproval);
    pendingApprovals.delete(matchKey);
  }
}

function shouldTrackStatusFine(state: "disabled" | "missing" | "existing" | "ignored"): boolean {
  return state === "missing";
}

function getRecoveryBoundaryPage(boundaryPage: number | null, currentPage: number): number {
  return boundaryPage ?? currentPage;
}

function getRecoveryStateAfterAdvance(boundaryPage: number | null, currentPage: number, attempts: number): { boundaryPage: number | null; attempts: number } {
  if (boundaryPage === null || currentPage > boundaryPage) {
    return { boundaryPage: null, attempts: 0 };
  }
  return { boundaryPage, attempts };
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

function isRetriableDetailParseError(message: string): boolean {
  return /^Expected detail page fields missing:/.test(message) || /^Could not find both lineup tables on match detail page\./.test(message);
}

function throwIfFatalAndHalted(isFatalDetailError: boolean, haltOnError: boolean, message: string): void {
  if (isFatalDetailError && haltOnError) {
    throw new Error(message);
  }
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

async function readMatchDetailPageWithRetry(
  page: Page,
  teamHints: { homeTeam: string; guestTeam: string }
): Promise<Awaited<ReturnType<typeof readMatchDetailPage>>> {
  const retryDelaysMs = [500, 1000, 1500];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await readMatchDetailPage(page, teamHints);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isRetriableDetailParseError(message) || attempt === retryDelaysMs.length) {
        throw error;
      }

      await page.waitForTimeout(retryDelaysMs[attempt]!);
      await waitForMatchDetailPage(page, { timeoutMs: retryDelaysMs[attempt]! + 1000 });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function run(): Promise<void> {
  const config = loadConfig();
  const browser = await chromium.launch({
    headless: !config.headed,
    slowMo: config.slowMoMs
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const actions: MatchAction[] = [];
  const actionIndexesByMatchKey = new Map<string, number>();
  const pendingApprovals = new Map<string, MatchAction>();
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
    naKosten: config.fineNaKosten,
    fineCatalogue: config.fineCatalogue
  };

  try {
    const modeSuffix = [
      config.dryRun ? "DRY RUN" : null,
      config.processAll ? "PROCESS ALL" : null,
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
      onlyUnapproved: !config.fineWorkbookPath && !config.processAll
    });

    let pageNumber = 1;
    let totalPages = 1;
    // This counter covers every session-expiry recovery while revisiting one list page.
    // It resets only after the run durably advances to the next list page.
    let recoveryAttemptsForCurrentPage = 0;
    const maxRecoveryAttemptsPerPage = 2;

    const recordAction = (matchKey: string, action: MatchAction): void => {
      const existingIndex = actionIndexesByMatchKey.get(matchKey);
      if (existingIndex === undefined) {
        actionIndexesByMatchKey.set(matchKey, actions.length);
        actions.push(action);
      } else {
        actions[existingIndex] = action;
      }
    };

    // A new unapproved-only search can hide a Save that succeeded just before expiry,
    // and a same-numbered page can lose rows after the result set shrinks. Restarting
    // an unfiltered traversal keeps the ambiguous row visible for reconciliation and
    // lets processedKeys safely skip rows already visited before the interruption.
    let recoveryTraversalBoundaryPage: number | null = null;
    const recoverCurrentListPage = async (): Promise<void> => {
      console.log(`Session expired; re-authenticating and restarting traversal from page 1 (was page ${pageNumber})...`);
      recoveryTraversalBoundaryPage = getRecoveryBoundaryPage(recoveryTraversalBoundaryPage, pageNumber);
      await login(page, config.baseUrl, config.username, config.password);
      await navigateToMatchSearch(page, config.group, { onlyUnapproved: false });
      pageNumber = 1;
    };

    const recoverCurrentPageSession = async (initialError: unknown): Promise<void> => {
      let error = initialError;
      while (true) {
        if (!isSessionExpiredError(error)) {
          throw error;
        }
        if (recoveryAttemptsForCurrentPage >= maxRecoveryAttemptsPerPage) {
          throw new Error(
            `Session expired after ${maxRecoveryAttemptsPerPage} recovery attempts while processing list page ${recoveryTraversalBoundaryPage ?? pageNumber}.`,
            { cause: error }
          );
        }
        recoveryAttemptsForCurrentPage += 1;
        try {
          await recoverCurrentListPage();
          return;
        } catch (recoveryError) {
          error = recoveryError;
        }
      }
    };

    const withCurrentPageRecovery = async <T>(operation: () => Promise<T>): Promise<T> => {
      while (true) {
        try {
          return await operation();
        } catch (error) {
          await recoverCurrentPageSession(error);
        }
      }
    };

    pageLoop: while (true) {
      await withCurrentPageRecovery(async () => {
        await ensureSessionActive(page);
        await assertMatchListPage(page);
      });
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
        const needsDetailVisit = shouldVisitMatchDetail(config.processAll, match, needsStatusFineDetail);

        reconcilePendingApproval(pendingApprovals, matchKey, match.isApproved, recordAction);
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
          await waitForMatchDetailPage(page);
          openedCount += 1;

          const detail = await readMatchDetailPageWithRetry(page, {
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
            recordAction(matchKey, pendingApprovals.get(matchKey) ?? action);
            pendingApprovals.delete(matchKey);
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
            recordAction(matchKey, action);
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

          const action: MatchAction = { match, action: "approved", validation };
          pendingApprovals.set(matchKey, action);
          await handleApproval(page, config.dryRun, true);
          recordAction(matchKey, action);
          pendingApprovals.delete(matchKey);
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

          if (isSessionExpiredError(error)) {
            // The current match may already have been saved. Re-reading the list lets the
            // server checkmark decide whether it needs another visit, avoiding duplicate approval.
            await recoverCurrentPageSession(error);
            processedKeys.delete(matchKey);
            continue pageLoop;
          }

          throwIfFatalAndHalted(isFatalDetailError, config.haltOnError, message);

          if (trackStatusFine && !statusFineKeys.has(matchKey)) {
            statusFineKeys.add(matchKey);
            statusFineMatches.push(match);
          }

          if (needsDetailVisit) {
            const action: MatchAction = { match, action: "error", error: message };
            recordAction(matchKey, action);
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
            await assertMatchListPage(page);
          } catch {
            try {
              await cancelAndReturn(page);
            } catch {
              // Best effort only. The loop will fail fast if the page cannot recover.
            }
          }
        }
      }

      if (pageNumber >= totalPages) {
        break;
      }

      let advanced: boolean;
      try {
        advanced = await goToNextPage(page, pageNumber, {
          debug: config.debug,
          reportDir: config.reportDir
        });
        if (advanced) {
          await ensureSessionActive(page);
          await assertMatchListPage(page);
        }
      } catch (error) {
        await recoverCurrentPageSession(error);
        // Recovery restarts at page one. Read it before attempting another advance.
        continue pageLoop;
      }
      if (!advanced) {
        break;
      }
      pageNumber += 1;
      const recoveryState = getRecoveryStateAfterAdvance(
        recoveryTraversalBoundaryPage,
        pageNumber,
        recoveryAttemptsForCurrentPage
      );
      recoveryAttemptsForCurrentPage = recoveryState.attempts;
      recoveryTraversalBoundaryPage = recoveryState.boundaryPage;
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
        fineCatalogue: config.fineCatalogue,
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

if (!process.env.VITEST) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
