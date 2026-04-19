import type { Page } from "playwright";
import { hasApprovalCheckbox, isApprovalCheckboxChecked } from "./approval-checkbox.js";
import { createDocument, normalizeForSearch, normalizeWhitespace } from "./dom.js";
import type { MatchDetail, Player, TeamLineup } from "./types.js";

function getDirectText(element: Element): string {
  return normalizeWhitespace(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
  );
}

function parsePlayersFromRows(rows: string[][]): { players: Player[]; hasMF: boolean; mfName?: string } {
  const players: Player[] = [];
  let hasMF = false;
  let mfName: string | undefined;

  for (const cells of rows) {
    if (cells.length === 0) {
      continue;
    }

    const first = cells[0] ?? "";
    if (/^mf$/i.test(first)) {
      hasMF = true;
      mfName = cells.find((cell, index) => index > 0 && cell) ?? mfName;
      continue;
    }

    const positionMatch = first.match(/^([1-6])$/);
    if (!positionMatch) {
      continue;
    }

    players.push({
      position: Number(positionMatch[1]),
      name: cells[1] ?? "",
      rank: cells[2] ?? ""
    });
  }

  return mfName ? { players, hasMF, mfName } : { players, hasMF };
}

function parsePlayers(table: Element): { players: Player[]; hasMF: boolean; mfName?: string } {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) => normalizeWhitespace(cell.textContent))
  );
  return parsePlayersFromRows(rows);
}

function getOwnRows(table: Element): string[][] {
  const directRows = Array.from(table.children)
    .flatMap((child) => {
      if (child.tagName.toLowerCase() === "tr") {
        return [child];
      }

      if (child.tagName.toLowerCase() === "tbody") {
        return Array.from(child.children).filter((element) => element.tagName.toLowerCase() === "tr");
      }

      return [];
    })
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => {
          const tagName = cell.tagName.toLowerCase();
          return tagName === "td" || tagName === "th";
        })
        .map((cell) => getDirectText(cell))
    );

  return directRows;
}

function findKontrolleContainer(document: Document): Element | null {
  return (
    Array.from(document.querySelectorAll("fieldset, section, div")).find((element) =>
      /kontrolle/i.test(normalizeWhitespace(element.textContent))
    ) ?? null
  );
}

function findLineupTables(document: Document): Element[] {
  const kontrolleContainer = findKontrolleContainer(document);
  const scope = kontrolleContainer ?? document;
  const tables = Array.from(scope.querySelectorAll("table"));

  const explicitLineupTables = tables.filter((table) => {
    const ownRows = getOwnRows(table);
    return ownRows.some((cells) => cells.some((cell) => /Name,\s*Vorname/i.test(cell)));
  });

  if (explicitLineupTables.length > 0) {
    return explicitLineupTables;
  }

  return tables.filter((table) => {
    const ownRows = getOwnRows(table);
    if (ownRows.length === 0) {
      return false;
    }

    const ownText = ownRows.flat().join(" ");
    return /(MF|\b1\b|\b2\b|\b3\b|\b4\b|\b5\b|\b6\b)/.test(ownText);
  });
}

function teamNameFromTable(table: Element, fallback: string): string {
  const caption = normalizeWhitespace(table.querySelector("caption")?.textContent);
  if (caption) {
    return caption;
  }

  const previousHeading = normalizeWhitespace(
    table.previousElementSibling?.textContent ?? table.parentElement?.previousElementSibling?.textContent ?? ""
  );
  return previousHeading || fallback;
}

function parseTeam(table: Element, fallbackName: string): TeamLineup {
  const parsed = parsePlayers(table);
  return {
    teamName: teamNameFromTable(table, fallbackName),
    hasMF: parsed.hasMF,
    playerCount: parsed.players.length,
    players: parsed.players.sort((left, right) => left.position - right.position),
    ...(parsed.mfName ? { mfName: parsed.mfName } : {})
  };
}

function parseCombinedTeamTable(
  table: Element,
  teamHints: { homeTeam: string; guestTeam: string }
): { homeTeam: TeamLineup; guestTeam: TeamLineup } {
  const rowCells = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) => normalizeWhitespace(cell.textContent))
  );

  const splitIndex = Math.max(
    1,
    ...rowCells
      .map((cells) => Math.floor(cells.length / 2))
      .filter((count) => count > 0)
  );

  const leftRows = rowCells.map((cells) => cells.slice(0, splitIndex));
  const rightRows = rowCells.map((cells) => cells.slice(splitIndex));

  const homeParsed = parsePlayersFromRows(leftRows);
  const guestParsed = parsePlayersFromRows(rightRows);

  return {
    homeTeam: {
      teamName: teamHints.homeTeam,
      hasMF: homeParsed.hasMF,
      playerCount: homeParsed.players.length,
      players: homeParsed.players.sort((left, right) => left.position - right.position),
      ...(homeParsed.mfName ? { mfName: homeParsed.mfName } : {})
    },
    guestTeam: {
      teamName: teamHints.guestTeam,
      hasMF: guestParsed.hasMF,
      playerCount: guestParsed.players.length,
      players: guestParsed.players.sort((left, right) => left.position - right.position),
      ...(guestParsed.mfName ? { mfName: guestParsed.mfName } : {})
    }
  };
}

function isBefore(first: Node, second: Node): boolean {
  return Boolean(first.compareDocumentPosition(second) & 4);
}

function collectText(elements: Element[]): string {
  return normalizeWhitespace(elements.map((node) => node.textContent).join(" "));
}

function extractHinweiseBeforeLineup(document: Document, lineupTables: Element[]): string {
  const firstLineupTable = lineupTables[0] ?? null;
  if (!firstLineupTable) {
    return "";
  }

  const kontrolleContainer = findKontrolleContainer(document);
  if (!kontrolleContainer) {
    return "";
  }

  const hinweiseHeading = Array.from(kontrolleContainer.querySelectorAll("h1, h2, h3, h4, legend, p, div, td")).find(
    (element) => /^hinweis(?:e|\(e\))?$/i.test(normalizeWhitespace(getDirectText(element) || element.textContent))
  );

  if (!hinweiseHeading || !isBefore(hinweiseHeading, firstLineupTable)) {
    return "";
  }

  const collected: string[] = [];
  let cursor = hinweiseHeading.nextElementSibling;

  while (cursor && cursor !== firstLineupTable) {
    if (cursor.tagName.toLowerCase() === "table") {
      break;
    }

    const text = normalizeWhitespace(cursor.textContent);
    if (text) {
      collected.push(text);
    }

    cursor = cursor.nextElementSibling;
  }

  return normalizeWhitespace(collected.join(" "));
}

function detectUnexpectedTopContent(
  document: Document,
  lineupTables: Element[]
): { hasErrorMessages: boolean; errorMessageText?: string } {
  const buttonRow = Array.from(document.querySelectorAll("body *")).find((element) => {
    const text = normalizeWhitespace(element.textContent);
    return /abbrechen/i.test(text) && /speichern/i.test(text);
  });
  const kontrolleFieldset = Array.from(document.querySelectorAll("fieldset, h1, h2, h3, legend")).find((element) =>
    /kontrolle/i.test(normalizeWhitespace(element.textContent))
  );

  const explicitErrors = buttonRow && kontrolleFieldset
    ? Array.from(document.querySelectorAll(".error-msg, .error, .warning")).filter(
        (element) => isBefore(buttonRow, element) && isBefore(element, kontrolleFieldset)
      )
    : [];

  if (explicitErrors.length > 0) {
    return {
      hasErrorMessages: true,
      errorMessageText: collectText(explicitErrors)
    };
  }

  const firstLineupTable = lineupTables[0] ?? null;
  if (kontrolleFieldset && firstLineupTable) {
    const kontrolleContainer =
      kontrolleFieldset.tagName.toLowerCase() === "fieldset" ? kontrolleFieldset : kontrolleFieldset.parentElement;

    if (kontrolleContainer) {
      const validationErrors = Array.from(kontrolleContainer.querySelectorAll(".error-msg, .error, .warning")).filter(
        (element) => isBefore(element, firstLineupTable)
      );

      if (validationErrors.length > 0) {
        return {
          hasErrorMessages: true,
          errorMessageText: collectText(validationErrors)
        };
      }
    }
  }

  const hinweiseText = extractHinweiseBeforeLineup(document, lineupTables);
  if (hinweiseText) {
    return {
      hasErrorMessages: true,
      errorMessageText: hinweiseText
    };
  }

  if (!buttonRow || !kontrolleFieldset || !buttonRow.parentElement) {
    return { hasErrorMessages: false };
  }

  const parent = buttonRow.parentElement;
  const siblings = Array.from(parent.children);
  const start = siblings.indexOf(buttonRow);
  const end = siblings.indexOf(kontrolleFieldset);
  if (start === -1 || end === -1 || end <= start + 1) {
    return { hasErrorMessages: false };
  }

  const betweenText = siblings
    .slice(start + 1, end)
    .map((element) => normalizeWhitespace(element.textContent))
    .filter(Boolean)
    .join(" ");

  return betweenText ? { hasErrorMessages: true, errorMessageText: betweenText } : { hasErrorMessages: false };
}

function detectMatchFormat(document: Document): string {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, legend, title"));
  return headings.map((node) => normalizeWhitespace(node.textContent)).find((text) => /Paarkreuz/i.test(text)) ?? "Unknown";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectCompetitionName(document: Document, teamHints: { homeTeam: string; guestTeam: string }): string {
  const headingText = normalizeWhitespace(document.querySelector("h1")?.textContent);
  if (!headingText) {
    return "";
  }

  const pattern = new RegExp(
    `(?:ergebniserfassung\\s*)?(?:\\([^)]*\\)\\s*)?(.+?),\\s*${escapeRegex(teamHints.homeTeam)}\\s*-\\s*${escapeRegex(
      teamHints.guestTeam
    )}`,
    "i"
  );
  const teamMatch = headingText.match(pattern);
  if (!teamMatch) {
    return "";
  }

  return normalizeWhitespace(teamMatch[1]).replace(/^spielbetrieb\s*ergebniserfassung\s*(?:\([^)]*\))?\s*/i, "");
}

function splitCompetitionName(competitionName: string): { competitionLiga: string; competitionGruppe: string } {
  const normalizedCompetition = normalizeWhitespace(competitionName)
    .replace(/\bErwachsene\b/gi, "")
    .replace(/\bJugend\b/gi, "")
    .trim();

  const match = normalizedCompetition.match(/^(.*?)(?:\s+(\d+))?$/);

  return {
    competitionLiga: normalizeWhitespace(match?.[1]) || normalizedCompetition,
    competitionGruppe: normalizeWhitespace(match?.[2]) || ""
  };
}

function extractBemerkungen(document: Document): string {
  const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, p, div, td")).find((element) =>
    /^bemerkungen$/i.test(normalizeWhitespace(getDirectText(element) || normalizeWhitespace(element.textContent)))
  );

  if (!heading) {
    return "";
  }

  const collected: string[] = [];
  let cursor = heading.nextElementSibling;

  while (cursor) {
    const tagName = cursor.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName) || tagName === "legend") {
      break;
    }

    if (tagName === "p" || tagName === "div" || tagName === "textarea" || tagName === "table") {
      const text =
        tagName === "textarea"
          ? normalizeWhitespace((cursor as HTMLTextAreaElement).value)
          : normalizeWhitespace(cursor.textContent);

      if (text) {
        collected.push(text);
      }
    }

    if (
      cursor.querySelector('input[type="checkbox"]') &&
      /spielbericht genehmigt/i.test(normalizeWhitespace(cursor.textContent))
    ) {
      break;
    }

    cursor = cursor.nextElementSibling;
  }

  return normalizeWhitespace(collected.join(" "));
}

function getMissingExpectedFields(document: Document, lineupTableCount: number): string[] {
  const missing: string[] = [];

  const heading = Array.from(document.querySelectorAll("h1, h2, h3, title")).find((element) =>
    /ergebniserfassung|paarkreuz/i.test(normalizeWhitespace(element.textContent))
  );
  if (!heading) {
    missing.push("match heading");
  }

  const hasCancel = Array.from(document.querySelectorAll('input[type="submit"], button, a')).some((element) =>
    /abbrechen/i.test(normalizeWhitespace(element.textContent || element.getAttribute("value")))
  );
  if (!hasCancel) {
    missing.push("Abbrechen control");
  }

  const hasSave = Array.from(document.querySelectorAll('input[type="submit"], button, a')).some((element) =>
    /speichern/i.test(normalizeWhitespace(element.textContent || element.getAttribute("value")))
  );
  if (!hasSave) {
    missing.push("Speichern control");
  }

  const kontrolleFieldset = Array.from(document.querySelectorAll("fieldset, h1, h2, h3, legend")).find((element) =>
    /kontrolle/i.test(normalizeWhitespace(element.textContent))
  );
  if (!kontrolleFieldset) {
    missing.push("Kontrolle section");
  }

  if (lineupTableCount === 0) {
    missing.push("lineup table(s)");
  }

  const bemerkungenHeading = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, p, div, td")).find(
    (element) => /^bemerkungen$/i.test(normalizeWhitespace(getDirectText(element) || normalizeWhitespace(element.textContent)))
  );
  if (!bemerkungenHeading) {
    missing.push("Bemerkungen section");
  }

  if (!hasApprovalCheckbox(document)) {
    missing.push('approval checkbox "Spielbericht genehmigt"');
  }

  return missing;
}

export function mentionsMfInBemerkungen(teamName: string, bemerkungen: string): boolean {
  const normalizedTeam = normalizeForSearch(teamName);
  const normalizedRemarks = normalizeForSearch(bemerkungen);
  if (!normalizedRemarks.includes("mf")) {
    return false;
  }

  if (normalizedTeam && normalizedRemarks.includes(normalizedTeam)) {
    return true;
  }

  const teamTokens = normalizedTeam.split(" ").filter((token) => token.length > 2);
  return teamTokens.some((token) => normalizedRemarks.includes(token));
}

export function hasStructuredMfEvidenceInBemerkungen(bemerkungen: string): boolean {
  const normalizedRemarks = normalizeForSearch(bemerkungen);
  if (!/\b(?:mf|mannschaftsfuhrer)\b/.test(normalizedRemarks)) {
    return false;
  }

  const hasTeamAReference = /\ba\s*[1-6]\b/.test(normalizedRemarks);
  const hasTeamBReference = /\bb\s*[1-6]\b/.test(normalizedRemarks);
  return hasTeamAReference && hasTeamBReference;
}

export function parseMatchDetailHtml(
  html: string,
  teamHints: { homeTeam: string; guestTeam: string }
): MatchDetail {
  const document = createDocument(html);
  const tables = findLineupTables(document);
  const missingExpectedFields = getMissingExpectedFields(document, tables.length);
  if (missingExpectedFields.length > 0) {
    throw new Error(`Expected detail page fields missing: ${missingExpectedFields.join(", ")}`);
  }

  const parsedTeams =
    tables.length >= 2
      ? {
          homeTeam: parseTeam(tables[0]!, teamHints.homeTeam),
          guestTeam: parseTeam(tables[1]!, teamHints.guestTeam)
        }
      : tables.length === 1
        ? parseCombinedTeamTable(tables[0]!, teamHints)
        : null;

  if (!parsedTeams) {
    throw new Error("Could not find both lineup tables on match detail page.");
  }

  const errorState = detectUnexpectedTopContent(document, tables);
  const competitionName = detectCompetitionName(document, teamHints);
  const competitionInfo = competitionName ? splitCompetitionName(competitionName) : null;

  return {
    matchFormat: detectMatchFormat(document),
    ...(competitionName ? { competitionName } : {}),
    ...(competitionInfo ?? {}),
    homeTeam: parsedTeams.homeTeam,
    guestTeam: parsedTeams.guestTeam,
    hasErrorMessages: errorState.hasErrorMessages,
    bemerkungen: extractBemerkungen(document),
    isAlreadyApproved: isApprovalCheckboxChecked(document),
    ...(errorState.errorMessageText ? { errorMessageText: errorState.errorMessageText } : {})
  };
}

export async function readMatchDetailPage(
  page: Page,
  teamHints: { homeTeam: string; guestTeam: string }
): Promise<MatchDetail> {
  return parseMatchDetailHtml(await page.content(), teamHints);
}

export async function waitForMatchDetailPage(
  page: Page,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;

  await page
    .waitForFunction(
      () => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const heading = Array.from(document.querySelectorAll("h1, h2, h3, title")).some((element) =>
          /ergebniserfassung|paarkreuz/i.test(normalize(element.textContent))
        );
        const saveControl = Array.from(document.querySelectorAll('input[type="submit"], button, a')).some((element) =>
          /speichern/i.test(normalize(element.textContent || element.getAttribute("value")))
        );
        const kontrolle = Array.from(document.querySelectorAll("fieldset, h1, h2, h3, legend")).some((element) =>
          /kontrolle/i.test(normalize(element.textContent))
        );
        const tableCount = document.querySelectorAll("table").length;

        return heading && saveControl && kontrolle && tableCount > 0;
      },
      undefined,
      { timeout: timeoutMs }
    )
    .catch(() => {
      // Parsing will surface precise missing fields if markers never settle.
    });
}
