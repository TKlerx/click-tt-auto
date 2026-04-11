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

function isApprovedRow(row: Element): boolean {
  const text = normalizeWhitespace(row.textContent);
  const icons = Array.from(row.querySelectorAll("img, svg, input[type='checkbox']"));
  const iconMatch = icons.some((element) => {
    const haystack = normalizeWhitespace(
      element.getAttribute("alt") ??
        element.getAttribute("title") ??
        element.getAttribute("aria-label") ??
        ""
    );
    return /genehmigt|approved|check/i.test(haystack);
  });

  return iconMatch || /\bgenehmigt\b/i.test(text);
}

function findGroupForRow(row: Element): string {
  let cursor: Element | null = row.previousElementSibling;
  while (cursor) {
    const text = normalizeWhitespace(cursor.textContent);
    if (text && !cursor.querySelector("a[href]")) {
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

  const [homeTeam = "", guestTeam = ""] = teamCandidates.slice(-2);
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

export async function goToNextPage(page: Page, currentPage: number): Promise<boolean> {
  const nextPageNumber = String(currentPage + 1);
  const nextLink = page.getByRole("link", { name: new RegExp(`^${nextPageNumber}$`) }).first();
  if ((await nextLink.count()) === 0) {
    return false;
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
