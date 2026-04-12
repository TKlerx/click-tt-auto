import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { createDocument, normalizeWhitespace } from "./dom.js";
import type { MatchEntry, PaginationInfo, ParsedMatchListPage } from "./types.js";

function parseScore(value: string): { home: number; guest: number } {
  const match = value.match(/(\d+)\s*:\s*(\d+)/);
  if (!match) {
    return { home: 0, guest: 0 };
  }

  return { home: Number(match[1]), guest: Number(match[2]) };
}

function parsePagination(text: string): PaginationInfo {
  const match = text.match(/Seite\s+(\d+)\s*\/\s*(\d+)/i);
  if (!match) {
    return { currentPage: 1, totalPages: 1 };
  }

  return { currentPage: Number(match[1]), totalPages: Number(match[2]) };
}

function parseTotalMatches(text: string): number {
  const match = text.match(/\b(\d+)\s+gefunden\b/i);
  if (!match) {
    return 0;
  }

  return Number(match[1]);
}

async function readVisiblePagination(page: Page): Promise<PaginationInfo> {
  const bodyText = normalizeWhitespace(await page.locator("body").textContent());
  return parsePagination(bodyText);
}

function isApprovedRow(row: Element): boolean {
  const text = normalizeWhitespace(row.textContent);
  const icons = Array.from(row.querySelectorAll("img, svg, input[type='checkbox']"));
  const iconMatch = icons.some((element) => {
    const haystack = normalizeWhitespace(
      [
        element.getAttribute("alt"),
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("src"),
        element.getAttribute("class")
      ]
        .filter(Boolean)
        .join(" ")
    );
    return /genehmigt|approved|check(?:\.gif)?|icons\/check/i.test(haystack);
  });

  return iconMatch || /\bgenehmigt\b/i.test(text);
}

function findGroupForRow(row: Element): string {
  const ignoredTexts = [
    /auswahl/i,
    /datum/i,
    /heimmannschaft/i,
    /gastmannschaft/i,
    /spiellokal/i,
    /spiele/i,
    /status/i,
    /punkte/i,
    /bericht/i
  ];

  let cursor: Element | null = row.previousElementSibling;
  while (cursor) {
    if (cursor.tagName.toLowerCase() === "tr" && cursor.querySelector("th")) {
      cursor = cursor.previousElementSibling;
      continue;
    }

    const text = normalizeWhitespace(cursor.textContent);
    const shouldIgnore = ignoredTexts.some((pattern) => pattern.test(text));
    const boldText = normalizeWhitespace(cursor.querySelector("b, strong")?.textContent);

    if (boldText && !shouldIgnore) {
      return boldText;
    }

    if (text && !cursor.querySelector("a[href]") && !shouldIgnore) {
      return text;
    }
    cursor = cursor.previousElementSibling;
  }

  return "Alle meine Gruppen";
}

function parseMatchRow(row: Element, index: number): MatchEntry | null {
  const link = row.querySelector<HTMLAnchorElement>('a[href*="erfassen" i], a[href]');
  if (!link) {
    return null;
  }

  const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => normalizeWhitespace(cell.textContent));
  const dateIndex = cells.findIndex((cell) => /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(cell));
  const date = dateIndex >= 0 ? cells[dateIndex] ?? "" : "";
  const status = cells.find((cell) => /abgeschlossen|offen|nicht angetreten|verlegt|abgesetzt/i.test(cell)) ?? "";
  const points = cells.find((cell) => /^\d+\s*:\s*\d+$/.test(cell)) ?? "";
  const scoreCell =
    cells.find((cell) => /(\d+)\s*:\s*(\d+).*?(\d+\s*:\s*\d+)/.test(cell)) ??
    cells.find((cell) => /^(\d+)\s*:\s*(\d+)$/.test(cell)) ??
    "";
  const score = parseScore(scoreCell);
  const fixedHomeTeam =
    dateIndex >= 2
      ? normalizeWhitespace(cells[dateIndex + 2] ?? "")
      : "";
  const fixedGuestTeam =
    dateIndex >= 2
      ? normalizeWhitespace(cells[dateIndex + 3] ?? "")
      : "";

  const relevantCells = cells.slice(dateIndex >= 0 ? dateIndex + 1 : 0);
  const teamCandidates = relevantCells.filter((cell) => {
    if (!cell || cell === status || cell === points || cell === scoreCell || /erfassen/i.test(cell)) {
      return false;
    }

    if (/^\d+$/.test(cell)) {
      return false;
    }

    if (/^(Mo|Di|Mi|Do|Fr|Sa|So)\.?$/i.test(cell)) {
      return false;
    }

    return /[A-Za-zÄÖÜäöü]/.test(cell);
  });

  const [fallbackHomeTeam = "", fallbackGuestTeam = ""] = teamCandidates.slice(-2);
  const homeTeam = fixedHomeTeam || fallbackHomeTeam;
  const guestTeam = fixedGuestTeam || fallbackGuestTeam;
  if (!date || !homeTeam || !guestTeam) {
    return null;
  }

  return {
    index,
    date,
    homeTeam,
    guestTeam,
    scoreHome: score.home,
    scoreGuest: score.guest,
    status,
    points,
    isApproved: isApprovedRow(row),
    erfassenUrl: link.getAttribute("href") ?? "",
    group: findGroupForRow(row)
  };
}

export function parseMatchListHtml(html: string): ParsedMatchListPage {
  const document = createDocument(html);
  const bodyText = normalizeWhitespace(document.body.textContent);
  const rows = Array.from(document.querySelectorAll("tr"));
  const allMatches = rows
    .map((row, index) => parseMatchRow(row, index))
    .filter((entry): entry is MatchEntry => entry !== null);
  const matches = allMatches.filter((entry) => entry.status.toLowerCase() === "abgeschlossen" && !entry.isApproved);

  return {
    allMatches,
    matches,
    pagination: parsePagination(bodyText),
    totalMatches: parseTotalMatches(bodyText)
  };
}

export async function readMatchListPage(page: Page): Promise<ParsedMatchListPage> {
  return parseMatchListHtml(await page.content());
}

export async function assertMatchListPage(page: Page): Promise<void> {
  const bodyText = normalizeWhitespace(await page.locator("body").textContent());
  const hasPaginationOrCount = /\b\d+\s+gefunden\b/i.test(bodyText) || /seite\s+\d+\s*\/\s*\d+/i.test(bodyText);
  const hasMatchContext = /begegnungen|erfassen|genehmigt/i.test(bodyText);

  if (!hasPaginationOrCount || !hasMatchContext) {
    throw new Error("Expected match results list page, but the usual Begegnungen result markers were missing.");
  }
}

async function writePagerDebugSnapshot(
  page: Page,
  reportDir: string | undefined,
  currentPage: number,
  phase: string
): Promise<string | null> {
  if (!reportDir) {
    return null;
  }

  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace(/-/g, "");
  const filePath = path.join(reportDir, `debug-pager-p${currentPage}-${phase}-${timestamp}.html`);
  await fs.writeFile(filePath, await page.content(), "utf8");
  return filePath;
}

async function logPagerDebug(
  page: Page,
  currentPage: number,
  nextPageNumber: string,
  phase: string,
  reportDir?: string
): Promise<void> {
  const bodyText = normalizeWhitespace(await page.locator("body").textContent());
  const pageSummary = bodyText.match(/Seite\s+\d+\s*\/\s*\d+/i)?.[0] ?? "Seite ? / ?";
  const directNextCount = await page.getByRole("link", { name: new RegExp(`^${nextPageNumber}$`) }).count();
  const jumpCount = await page.locator('a:has(img[title="10 Seiten vor"])').count();
  const pagerSnippet = normalizeWhitespace(
    (await page
      .locator("table")
      .filter({ hasText: /Seite\s+\d+\s*\/\s*\d+/i })
      .first()
      .textContent()
      .catch(() => "")) || ""
  );
  const snapshotPath = await writePagerDebugSnapshot(page, reportDir, currentPage, phase);

  console.error(
    `[PAGER DEBUG] ${phase} on page ${currentPage}: ${pageSummary} | next=${nextPageNumber} directLink=${directNextCount} jumpLink=${jumpCount}`
  );
  if (pagerSnippet) {
    console.error(`[PAGER DEBUG] Pager text: ${pagerSnippet}`);
  }
  if (snapshotPath) {
    console.error(`[PAGER DEBUG] Snapshot saved to: ${snapshotPath}`);
  }
}

export async function goToNextPage(
  page: Page,
  currentPage: number,
  options: { debug?: boolean; reportDir?: string } = {}
): Promise<boolean> {
  const nextPageNumber = String(currentPage + 1);
  const nextLink = page.getByRole("link", { name: new RegExp(`^${nextPageNumber}$`) }).first();
  if ((await nextLink.count()) === 0) {
    if (options.debug) {
      await logPagerDebug(page, currentPage, nextPageNumber, "next-link-missing", options.reportDir);
    }

    if (currentPage % 10 !== 0) {
      return false;
    }

    const pagerAdvance = page
      .locator("a")
      .filter({
        has: page.locator('img[title="10 Seiten vor"]')
      })
      .filter({
        hasNot: page.locator('img[title*="letzten"], img[src*="arrow.right_end"]')
      })
      .first();

    if ((await pagerAdvance.count()) === 0) {
      if (options.debug) {
        await logPagerDebug(page, currentPage, nextPageNumber, "jump-link-missing", options.reportDir);
      }
      return false;
    }

    await Promise.all([page.waitForLoadState("domcontentloaded"), pagerAdvance.click()]);

    const paginationAfterJump = await readVisiblePagination(page);
    if (paginationAfterJump.currentPage === Number(nextPageNumber)) {
      return true;
    }

    const revealedNextLink = page.getByRole("link", { name: new RegExp(`^${nextPageNumber}$`) }).first();
    if ((await revealedNextLink.count()) === 0) {
      if (options.debug) {
        await logPagerDebug(page, currentPage, nextPageNumber, "next-link-still-missing-after-jump", options.reportDir);
      }
      return false;
    }

    await Promise.all([page.waitForLoadState("domcontentloaded"), revealedNextLink.click()]);
    return true;
  }

  await Promise.all([page.waitForLoadState("domcontentloaded"), nextLink.click()]);
  return true;
}

export async function findMatchLink(page: Page, entry: MatchEntry): Promise<Locator | null> {
  const candidateRows = page
    .locator("tr")
    .filter({ hasText: entry.date })
    .filter({ hasText: entry.homeTeam })
    .filter({ hasText: entry.guestTeam });

  const rowCount = await candidateRows.count();
  for (let index = 0; index < rowCount; index += 1) {
    const row = candidateRows.nth(index);

    const preferredLink =
      entry.erfassenUrl.length > 0
        ? row.locator(`a[href="${entry.erfassenUrl.replace(/"/g, '\\"')}"]`).first()
        : row.locator("a").first();
    if ((await preferredLink.count()) > 0) {
      return preferredLink;
    }

    const textLink = row.getByRole("link", { name: /erfassen/i }).first();
    if ((await textLink.count()) > 0) {
      return textLink;
    }

    const fallbackLink = row.locator("a[href]").first();
    if ((await fallbackLink.count()) > 0) {
      return fallbackLink;
    }
  }

  return null;
}
