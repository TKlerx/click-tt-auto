import ExcelJS, { type Workbook as ExcelWorkbook, type Worksheet } from "exceljs";
import { normalizeForSearch, normalizeWhitespace } from "./dom.js";
import type {
  FineCandidate,
  FineCatalogue,
  FineCatalogueEntry,
  FineCatalogueFineDetails,
  FineCatalogueLeague,
  FineCatalogueMatchSummary,
  FineSyncResult,
  MatchAction,
  MatchEntry,
  ValidationCheck
} from "./types.js";

const { Workbook: ExcelWorkbookCtor } = ExcelJS;

const BASE_HEADERS = [
  "Liga",
  "Gruppe",
  "Serie",
  "Datum",
  "Spielnummer",
  "Heim",
  "Gast",
  "Strafe gegen",
  "Grund",
  "Rechtsgrundlage",
  "Bemerkung",
  "Kosten",
  "Spielleiter",
  "Eingetragen am"
] as const;

const ADDED_AT_COLUMN_NAME = "Eingetragen am";
const CLICK_TT_TEXT_COLUMN_NAME = "Click-TT Text";
const DATE_COLUMN_NAME = "Datum";
const DATE_NUMBER_FORMAT = "dd.mm.yyyy";
const ADDED_AT_NUMBER_FORMAT = "yyyy-mm-dd hh:mm:ss";

interface FineSyncOptions {
  workbookPath: string | null;
  sheetName: string | null;
  ignoreColumnName: string;
  spielleiter: string | null;
  defaultLiga: string | null;
  defaultGruppe: string | null;
  naKosten: number;
  fineCatalogue: FineCatalogue | null;
  dryRun?: boolean;
  actions: MatchAction[];
  statusFineMatches: MatchEntry[];
}

interface LeagueInfo {
  liga: string;
  gruppe: string;
}

interface FineWorkbookIndex {
  enabled: boolean;
  existingKeys: Set<string>;
  ignoredKeys: Set<string>;
}

interface CatalogueResolution {
  entry: FineCatalogueEntry | null;
  matched: boolean;
  pattern: string;
  lowestTeamApplied: boolean;
}

type StatusFineCandidateState = "disabled" | "missing" | "existing" | "ignored";

const EVENT_NICHT_ANGETRETEN = "nicht-angetreten";
const EVENT_MF_FEHLT = "mf-fehlt";
const EVENT_UNVOLLSTAENDIGE_EINZELAUFSTELLUNG = "unvollstaendige-einzelaufstellung";
const EVENT_ERROR_MESSAGE = "error-message";

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if ("result" in value && (typeof value.result === "string" || typeof value.result === "number")) {
      return String(value.result);
    }

    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink;
    }
  }

  return "";
}

function getFailedChecks(action: MatchAction): ValidationCheck[] {
  return action.validation?.checks.filter((check) => !check.passed) ?? [];
}

function getActionFailureSummary(action: MatchAction): string {
  const reasons = getFailedChecks(action)
    .map((check) => normalizeWhitespace(check.reason))
    .filter(Boolean);

  if (reasons.length === 0) {
    return "Automatische Genehmigung übersprungen";
  }

  return reasons.join("; ");
}

function extractDateOnly(value: string): string {
  const match = value.match(/\d{1,2}\.\d{1,2}\.\d{4}/);
  return match?.[0] ?? value;
}

function parseWorkbookDate(value: string): Date | null {
  const normalizedValue = normalizeWhitespace(value);
  const dotMatch = normalizedValue.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function normalizeDateKey(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${day}.${month}.${year}`;
  }

  const parsed = parseWorkbookDate(value);
  if (parsed) {
    return normalizeDateKey(parsed);
  }

  return normalizeWhitespace(value);
}

function deriveSerie(value: string): string {
  const dateText = extractDateOnly(value);
  const match = dateText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return "";
  }

  const month = Number(match[2]);
  return month >= 8 ? "Hinserie" : "Rückserie";
}

function deriveSeason(value: string): string {
  const dateText = extractDateOnly(value);
  const match = dateText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return "";
  }

  const month = Number(match[2]);
  const year = Number(match[3]);
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function parseLeagueInfo(group: string, defaultLiga: string | null, defaultGruppe: string | null): LeagueInfo {
  const normalizedGroup = normalizeWhitespace(group)
    .replace(/\bErwachsene\b/gi, "")
    .replace(/\bJugend\b/gi, "")
    .trim();

  if (
    !normalizedGroup ||
    /auswahl|datum|heimmannschaft|gastmannschaft|spiellokal|spiele|status|info|punkte|bericht/i.test(normalizedGroup) ||
    /^alle meine gruppen$/i.test(normalizedGroup)
  ) {
    return {
      liga: defaultLiga ?? "",
      gruppe: defaultGruppe ?? ""
    };
  }

  const numberMatch = normalizedGroup.match(/^(.*?)(?:\s+(\d+))?$/);
  return {
    liga: normalizeWhitespace(numberMatch?.[1]) || defaultLiga || normalizedGroup,
    gruppe: normalizeWhitespace(numberMatch?.[2]) || defaultGruppe || ""
  };
}

function resolveLeagueInfo(
  match: MatchEntry,
  defaultLiga: string | null,
  defaultGruppe: string | null
): LeagueInfo {
  const liga = normalizeWhitespace(match.liga);
  const gruppe = normalizeWhitespace(match.gruppe);

  if (liga || gruppe) {
    return {
      liga: liga || defaultLiga || "",
      gruppe: gruppe || defaultGruppe || ""
    };
  }

  return parseLeagueInfo(match.group, defaultLiga, defaultGruppe);
}

function resolveCatalogueSeasonEntry(
  seasonCatalogue: FineCatalogue["seasons"][string] | undefined,
  leagueInfo: LeagueInfo,
  eventCode: string
): FineCatalogueEntry | null {
  if (!seasonCatalogue) {
    return null;
  }

  const normalizedLiga = normalizeForSearch(leagueInfo.liga);
  const exactLeague = Object.entries(seasonCatalogue.leagues ?? {}).find(
    ([leagueName]) => normalizeForSearch(leagueName) === normalizedLiga
  )?.[1];
  const wildcardLeague = seasonCatalogue.leagues?.["*"];

  return (
    exactLeague?.events?.[eventCode] ??
    wildcardLeague?.events?.[eventCode] ??
    seasonCatalogue.events?.[eventCode] ??
    null
  );
}

function findCatalogueLeague(
  seasonCatalogue: FineCatalogue["seasons"][string] | undefined,
  leagueInfo: LeagueInfo
): FineCatalogueLeague | undefined {
  if (!seasonCatalogue) {
    return undefined;
  }

  const normalizedLiga = normalizeForSearch(leagueInfo.liga);
  return Object.entries(seasonCatalogue.leagues ?? {}).find(([leagueName]) => normalizeForSearch(leagueName) === normalizedLiga)?.[1];
}

function isListedLowestTeam(
  seasonCatalogue: FineCatalogue["seasons"][string] | undefined,
  leagueInfo: LeagueInfo,
  teamName: string
): boolean {
  if (!seasonCatalogue || !teamName) {
    return false;
  }

  const normalizedTeam = normalizeForSearch(teamName);
  const exactLeague = findCatalogueLeague(seasonCatalogue, leagueInfo);
  const wildcardLeague = seasonCatalogue.leagues?.["*"];
  const lowestTeams = [
    ...(exactLeague?.lowestTeams ?? []),
    ...(wildcardLeague?.lowestTeams ?? []),
    ...(seasonCatalogue.lowestTeams ?? [])
  ];

  return lowestTeams.some((candidate) => normalizeForSearch(candidate) === normalizedTeam);
}

function isLowestTeam(catalogue: FineCatalogue | null, season: string, leagueInfo: LeagueInfo, teamName: string): boolean {
  if (!catalogue) {
    return false;
  }

  return (
    isListedLowestTeam(catalogue.seasons[season], leagueInfo, teamName) ||
    isListedLowestTeam(catalogue.seasons["*"], leagueInfo, teamName)
  );
}

function applyFineDetails(entry: FineCatalogueEntry, details: FineCatalogueFineDetails): FineCatalogueEntry {
  const result: FineCatalogueEntry = { ...entry };

  if (details.grund !== undefined) {
    result.grund = details.grund;
  }

  if (details.rechtsgrundlage !== undefined) {
    result.rechtsgrundlage = details.rechtsgrundlage;
  }

  if (details.kosten !== undefined) {
    result.kosten = details.kosten;
  }

  return result;
}

function resolveCatalogueEntry(
  catalogue: FineCatalogue | null,
  season: string,
  leagueInfo: LeagueInfo,
  eventCode: string,
  text: string,
  strafeGegen: string
): CatalogueResolution {
  if (!catalogue) {
    return { entry: null, matched: false, pattern: "", lowestTeamApplied: false };
  }

  const entry =
    resolveCatalogueSeasonEntry(catalogue.seasons[season], leagueInfo, eventCode) ??
    resolveCatalogueSeasonEntry(catalogue.seasons["*"], leagueInfo, eventCode);

  if (!entry) {
    return { entry: null, matched: false, pattern: "", lowestTeamApplied: false };
  }

  const normalizedText = normalizeForSearch(text);
  const pattern = entry.patterns?.find((candidate) => normalizedText.includes(normalizeForSearch(candidate.match)));
  const patternedEntry = pattern ? applyFineDetails(entry, pattern) : entry;

  if (!patternedEntry.lowestTeam || !isLowestTeam(catalogue, season, leagueInfo, strafeGegen)) {
    return { entry: patternedEntry, matched: true, pattern: pattern?.match ?? "", lowestTeamApplied: false };
  }

  return {
    entry: applyFineDetails(patternedEntry, patternedEntry.lowestTeam),
    matched: true,
    pattern: pattern?.match ?? "",
    lowestTeamApplied: true
  };
}

function applyCatalogueEntry(
  input: {
    grund: string;
    rechtsgrundlage?: string;
    kosten?: number | string;
  },
  entry: FineCatalogueEntry | null
): {
  grund: string;
  rechtsgrundlage?: string;
  kosten?: number | string;
} {
  if (!entry) {
    return input;
  }

  const result: {
    grund: string;
    rechtsgrundlage?: string;
    kosten?: number | string;
  } = {
    grund: entry.grund ?? input.grund,
  };

  const rechtsgrundlage = entry.rechtsgrundlage ?? input.rechtsgrundlage;
  if (rechtsgrundlage !== undefined) {
    result.rechtsgrundlage = rechtsgrundlage;
  }

  const kosten = entry.kosten ?? input.kosten;
  if (kosten !== undefined) {
    result.kosten = kosten;
  }

  return result;
}

function inferTeamFromPoints(match: MatchEntry): string {
  if (match.scoreHome > match.scoreGuest) {
    return match.guestTeam;
  }

  if (match.scoreGuest > match.scoreHome) {
    return match.homeTeam;
  }

  if (/^2\s*:\s*0$/.test(match.points)) {
    return match.guestTeam;
  }

  if (/^0\s*:\s*2$/.test(match.points)) {
    return match.homeTeam;
  }

  return "";
}

function inferTeamFromMessage(message: string, match: MatchEntry): string {
  const normalizedMessage = normalizeForSearch(message);
  const normalizedHome = normalizeForSearch(match.homeTeam);
  const normalizedGuest = normalizeForSearch(match.guestTeam);

  if (normalizedHome && normalizedMessage.includes(normalizedHome) && !normalizedMessage.includes(normalizedGuest)) {
    return match.homeTeam;
  }

  if (normalizedGuest && normalizedMessage.includes(normalizedGuest) && !normalizedMessage.includes(normalizedHome)) {
    return match.guestTeam;
  }

  if (/heimmannschaft/.test(normalizedMessage) && !/gastmannschaft/.test(normalizedMessage)) {
    return match.homeTeam;
  }

  if (/gastmannschaft/.test(normalizedMessage) && !/heimmannschaft/.test(normalizedMessage)) {
    return match.guestTeam;
  }

  return "";
}

function buildCandidate(
  match: MatchEntry,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "fineCatalogue">,
  input: {
    eventCode: string;
    matchText?: string;
    clickTtText?: string;
    strafeGegen: string;
    grund: string;
    bemerkung?: string;
    rechtsgrundlage?: string;
    kosten?: number | string;
  }
): FineCandidate {
  const leagueInfo = resolveLeagueInfo(match, options.defaultLiga, options.defaultGruppe);
  const fineSeason = deriveSeason(match.date);
  const catalogueResolution = resolveCatalogueEntry(
    options.fineCatalogue,
    fineSeason,
    leagueInfo,
    input.eventCode,
    input.matchText ?? input.grund,
    input.strafeGegen
  );
  const fineDetails = applyCatalogueEntry(input, catalogueResolution.entry);

  return {
    liga: leagueInfo.liga,
    gruppe: leagueInfo.gruppe,
    serie: deriveSerie(match.date),
    datum: parseWorkbookDate(extractDateOnly(match.date)) ?? extractDateOnly(match.date),
    spielnummer: "",
    heim: match.homeTeam,
    gast: match.guestTeam,
    strafeGegen: input.strafeGegen,
    grund: fineDetails.grund,
    rechtsgrundlage: fineDetails.rechtsgrundlage ?? "",
    clickTtText: input.clickTtText ?? "",
    bemerkung: input.bemerkung ?? "",
    kosten: fineDetails.kosten ?? "",
    spielleiter: options.spielleiter ?? "",
    eingetragenAm: "",
    fineEvent: input.eventCode,
    fineSeason,
    fineCatalogueMatched: catalogueResolution.matched,
    fineCataloguePattern: catalogueResolution.pattern,
    fineLowestTeamApplied: catalogueResolution.lowestTeamApplied
  };
}

function buildStatusFineCandidate(
  match: MatchEntry,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "naKosten" | "fineCatalogue">
): FineCandidate {
  const liableTeam = inferTeamFromPoints(match);

  return buildCandidate(match, options, {
    eventCode: EVENT_NICHT_ANGETRETEN,
    strafeGegen: liableTeam,
    grund: "Nicht angetreten",
    rechtsgrundlage: "A 20.1.1",
    bemerkung: `Aus Suchergebnis übernommen (Status: Nicht angetreten${match.isApproved ? "; bereits markiert" : ""})`,
    kosten: options.naKosten
  });
}

function extractMfCandidates(
  action: MatchAction,
  check: ValidationCheck,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "fineCatalogue">
): FineCandidate[] {
  const match = action.match;
  const reason = check.reason ?? "";
  const failureSummary = getActionFailureSummary(action);
  const matches = Array.from(reason.matchAll(/MF missing for ([^;]+)(?:;|$)/g));
  return matches.map((result) =>
    buildCandidate(match, options, {
      eventCode: EVENT_MF_FEHLT,
      matchText: reason,
      strafeGegen: normalizeWhitespace(result[1]),
      grund: "MF fehlt",
      bemerkung: failureSummary
    })
  );
}

function extractPlayerCountCandidates(
  action: MatchAction,
  check: ValidationCheck,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "fineCatalogue">
): FineCandidate[] {
  const match = action.match;
  const reason = check.reason ?? "";
  const failureSummary = getActionFailureSummary(action);
  const candidates: FineCandidate[] = [];
  const homeMatch = reason.match(/home has (\d+) numbered players/i);
  const guestMatch = reason.match(/guest has (\d+) numbered players/i);

  if (homeMatch) {
    candidates.push(
      buildCandidate(match, options, {
        eventCode: EVENT_UNVOLLSTAENDIGE_EINZELAUFSTELLUNG,
        matchText: reason,
        strafeGegen: match.homeTeam,
        grund: "Unvollständige Einzelaufstellung",
        bemerkung: failureSummary
      })
    );
  }

  if (guestMatch) {
    candidates.push(
      buildCandidate(match, options, {
        eventCode: EVENT_UNVOLLSTAENDIGE_EINZELAUFSTELLUNG,
        matchText: reason,
        strafeGegen: match.guestTeam,
        grund: "Unvollständige Einzelaufstellung",
        bemerkung: failureSummary
      })
    );
  }

  return candidates;
}

function extractErrorMessageCandidates(
  action: MatchAction,
  check: ValidationCheck,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "fineCatalogue">
): FineCandidate[] {
  const match = action.match;
  const reason = check.reason ?? "";
  const message = normalizeWhitespace(reason.replace(/^error message found:\s*/i, ""));
  if (!message) {
    return [];
  }

  return [
    buildCandidate(match, options, {
      eventCode: EVENT_ERROR_MESSAGE,
      matchText: message,
      clickTtText: message,
      strafeGegen: inferTeamFromMessage(message, match),
      grund: message,
      bemerkung: getActionFailureSummary(action)
    })
  ];
}

export function deriveFineCandidates(
  actions: MatchAction[],
  statusFineMatches: MatchEntry[],
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "naKosten" | "fineCatalogue">
): FineCandidate[] {
  const candidates: FineCandidate[] = [];

  for (const match of statusFineMatches) {
    if (normalizeForSearch(match.status) !== "nicht angetreten") {
      continue;
    }

    candidates.push(buildStatusFineCandidate(match, options));
  }

  for (const action of actions) {
    if (action.action !== "skipped") {
      continue;
    }

    for (const check of getFailedChecks(action)) {
      if (check.rule === "mf-present") {
        candidates.push(...extractMfCandidates(action, check, options));
      }

      if (check.rule === "player-count") {
        candidates.push(...extractPlayerCountCandidates(action, check, options));
      }

      if (check.rule === "error-messages") {
        candidates.push(...extractErrorMessageCandidates(action, check, options));
      }
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = buildCandidateKey(candidate);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildCandidateKey(candidate: FineCandidate): string {
  return [
    normalizeDateKey(candidate.datum),
    candidate.heim,
    candidate.gast,
    candidate.strafeGegen,
    candidate.grund
  ]
    .map((value) => normalizeForSearch(String(value)))
    .join("|");
}

function collectWorkbookKeys(
  worksheet: Worksheet,
  ignoreColumnName: string
): { existingKeys: Set<string>; ignoredKeys: Set<string> } {
  const headerMap = getHeaderMap(worksheet);
  const existingKeys = new Set<string>();
  const ignoredKeys = new Set<string>();

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const candidate: FineCandidate = {
      liga: getCellValue(worksheet, rowIndex, headerMap.get("Liga")),
      gruppe: getCellValue(worksheet, rowIndex, headerMap.get("Gruppe")),
      serie: getCellValue(worksheet, rowIndex, headerMap.get("Serie")),
      datum: getCellValue(worksheet, rowIndex, headerMap.get("Datum")),
      spielnummer: getCellValue(worksheet, rowIndex, headerMap.get("Spielnummer")),
      heim: getCellValue(worksheet, rowIndex, headerMap.get("Heim")),
      gast: getCellValue(worksheet, rowIndex, headerMap.get("Gast")),
      strafeGegen: getCellValue(worksheet, rowIndex, headerMap.get("Strafe gegen")),
      grund: getCellValue(worksheet, rowIndex, headerMap.get("Grund")),
      rechtsgrundlage: getCellValue(worksheet, rowIndex, headerMap.get("Rechtsgrundlage")),
      clickTtText: getCellValue(worksheet, rowIndex, headerMap.get(CLICK_TT_TEXT_COLUMN_NAME)),
      bemerkung: getCellValue(worksheet, rowIndex, headerMap.get("Bemerkung")),
      kosten: getCellValue(worksheet, rowIndex, headerMap.get("Kosten")) || "",
      spielleiter: getCellValue(worksheet, rowIndex, headerMap.get("Spielleiter")),
      eingetragenAm: getCellValue(worksheet, rowIndex, headerMap.get(ADDED_AT_COLUMN_NAME)),
      fineEvent: "",
      fineSeason: "",
      fineCatalogueMatched: false,
      fineCataloguePattern: "",
      fineLowestTeamApplied: false
    };
    const key = buildCandidateKey(candidate);
    if (!key.replace(/\|/g, "")) {
      continue;
    }

    existingKeys.add(key);
    if (isTruthyIgnore(getCellValue(worksheet, rowIndex, headerMap.get(ignoreColumnName)))) {
      ignoredKeys.add(key);
    }
  }

  return { existingKeys, ignoredKeys };
}

export async function loadFineWorkbookIndex(options: {
  workbookPath: string | null;
  sheetName: string | null;
  ignoreColumnName: string;
}): Promise<FineWorkbookIndex> {
  if (!options.workbookPath) {
    return {
      enabled: false,
      existingKeys: new Set<string>(),
      ignoredKeys: new Set<string>()
    };
  }

  const workbook = new ExcelWorkbookCtor();
  await workbook.xlsx.readFile(options.workbookPath);
  const worksheet = getWorksheet(workbook, options.sheetName);
  const { existingKeys, ignoredKeys } = collectWorkbookKeys(worksheet, options.ignoreColumnName);

  return {
    enabled: true,
    existingKeys,
    ignoredKeys
  };
}

export function getStatusFineCandidateState(
  match: MatchEntry,
  workbookIndex: FineWorkbookIndex,
  options: Pick<FineSyncOptions, "defaultLiga" | "defaultGruppe" | "spielleiter" | "naKosten" | "fineCatalogue">
): StatusFineCandidateState {
  if (!workbookIndex.enabled) {
    return "disabled";
  }

  const key = buildCandidateKey(buildStatusFineCandidate(match, options));
  if (workbookIndex.ignoredKeys.has(key)) {
    return "ignored";
  }

  if (workbookIndex.existingKeys.has(key)) {
    return "existing";
  }

  return "missing";
}

function isTruthyIgnore(value: unknown): boolean {
  return /^(1|true|yes|y|x|ignored?)$/i.test(normalizeWhitespace(cellValueToString(value)));
}

function getWorksheet(workbook: ExcelWorkbook, preferredSheetName: string | null): Worksheet {
  if (preferredSheetName) {
    const worksheet = workbook.getWorksheet(preferredSheetName);
    if (!worksheet) {
      throw new Error(`Fine workbook sheet not found: ${preferredSheetName}`);
    }
    return worksheet;
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Fine workbook does not contain any worksheets.");
  }

  return worksheet;
}

function getHeaderMap(worksheet: Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = worksheet.getRow(1);
  for (let index = 1; index <= headerRow.cellCount; index += 1) {
    const value = normalizeWhitespace(cellValueToString(headerRow.getCell(index).value));
    if (value) {
      map.set(value, index);
    }
  }
  return map;
}

function ensureColumn(worksheet: Worksheet, columnName: string, minimumColumnIndex: number): Map<string, number> {
  const headerMap = getHeaderMap(worksheet);
  if (!headerMap.has(columnName)) {
    const columnIndex = Math.max(worksheet.getRow(1).cellCount + 1, minimumColumnIndex);
    worksheet.getCell(1, columnIndex).value = columnName;
    headerMap.set(columnName, columnIndex);
  }
  return headerMap;
}

function ensureWorkbookColumns(worksheet: Worksheet, ignoreColumnName: string): Map<string, number> {
  let headerMap = getHeaderMap(worksheet);

  if (!headerMap.has(ADDED_AT_COLUMN_NAME)) {
    headerMap = ensureColumn(worksheet, ADDED_AT_COLUMN_NAME, BASE_HEADERS.length);
  }

  if (!headerMap.has(CLICK_TT_TEXT_COLUMN_NAME)) {
    headerMap = ensureColumn(worksheet, CLICK_TT_TEXT_COLUMN_NAME, BASE_HEADERS.length + 1);
  }

  if (!headerMap.has(ignoreColumnName)) {
    headerMap = ensureColumn(worksheet, ignoreColumnName, BASE_HEADERS.length + 2);
  }

  return headerMap;
}

function getLastDataRow(worksheet: Worksheet): number {
  for (let rowIndex = worksheet.rowCount; rowIndex >= 1; rowIndex -= 1) {
    const row = worksheet.getRow(rowIndex);
    const values = Array.isArray(row.values) ? row.values : [];
    if (values.some((value, index) => index > 0 && normalizeWhitespace(cellValueToString(value)))) {
      return rowIndex;
    }
  }
  return 1;
}

function getCellValue(worksheet: Worksheet, rowIndex: number, columnIndex: number | undefined): string {
  if (!columnIndex) {
    return "";
  }

  return normalizeWhitespace(cellValueToString(worksheet.getCell(rowIndex, columnIndex).value));
}

function setRequiredCellValue(worksheet: Worksheet, rowIndex: number, columnIndex: number | undefined, value: Date | number | string): void {
  if (!columnIndex) {
    throw new Error("Expected worksheet column is missing.");
  }

  worksheet.getCell(rowIndex, columnIndex).value = value;
}

function buildCatalogueMatchSummary(
  candidate: FineCandidate,
  state: FineCatalogueMatchSummary["state"]
): FineCatalogueMatchSummary {
  return {
    state,
    event: candidate.fineEvent,
    season: candidate.fineSeason,
    liga: candidate.liga,
    gruppe: candidate.gruppe,
    match: `${candidate.heim} vs ${candidate.gast} (${normalizeDateKey(candidate.datum)})`,
    strafeGegen: candidate.strafeGegen,
    grund: candidate.grund,
    rechtsgrundlage: candidate.rechtsgrundlage,
    kosten: candidate.kosten,
    clickTtText: candidate.clickTtText,
    catalogueMatched: candidate.fineCatalogueMatched,
    pattern: candidate.fineCataloguePattern,
    lowestTeamApplied: candidate.fineLowestTeamApplied
  };
}

export async function syncFineWorkbook(options: FineSyncOptions): Promise<FineSyncResult> {
  if (!options.workbookPath) {
    return {
      enabled: false,
      totalCandidates: 0,
      appended: 0,
      existing: 0,
      ignored: 0
    };
  }

  const candidates = deriveFineCandidates(options.actions, options.statusFineMatches, {
    defaultLiga: options.defaultLiga,
    defaultGruppe: options.defaultGruppe,
    spielleiter: options.spielleiter,
    naKosten: options.naKosten,
    fineCatalogue: options.fineCatalogue
  });

  const workbook = new ExcelWorkbookCtor();
  await workbook.xlsx.readFile(options.workbookPath);
  const worksheet = getWorksheet(workbook, options.sheetName);
  const headerMap = ensureWorkbookColumns(worksheet, options.ignoreColumnName);
  const { existingKeys, ignoredKeys } = collectWorkbookKeys(worksheet, options.ignoreColumnName);
  const appendedAt = new Date();

  let appended = 0;
  let existing = 0;
  let ignored = 0;
  let nextRowIndex = getLastDataRow(worksheet) + 1;
  const catalogueMatches: FineCatalogueMatchSummary[] = [];

  for (const candidate of candidates) {
    const key = buildCandidateKey(candidate);

    if (ignoredKeys.has(key)) {
      ignored += 1;
      catalogueMatches.push(buildCatalogueMatchSummary(candidate, "ignored"));
      continue;
    }

    if (existingKeys.has(key)) {
      existing += 1;
      catalogueMatches.push(buildCatalogueMatchSummary(candidate, "existing"));
      continue;
    }

    catalogueMatches.push(buildCatalogueMatchSummary(candidate, options.dryRun ? "would-append" : "appended"));

    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Liga"), candidate.liga);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Gruppe"), candidate.gruppe);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Serie"), candidate.serie);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get(DATE_COLUMN_NAME), candidate.datum);
    const dateColumnIndex = headerMap.get(DATE_COLUMN_NAME);
    if (dateColumnIndex) {
      worksheet.getCell(nextRowIndex, dateColumnIndex).numFmt = DATE_NUMBER_FORMAT;
    }
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Spielnummer"), candidate.spielnummer);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Heim"), candidate.heim);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Gast"), candidate.gast);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Strafe gegen"), candidate.strafeGegen);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Grund"), candidate.grund);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Rechtsgrundlage"), candidate.rechtsgrundlage);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get(CLICK_TT_TEXT_COLUMN_NAME), candidate.clickTtText);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Bemerkung"), candidate.bemerkung);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Kosten"), candidate.kosten);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get("Spielleiter"), candidate.spielleiter);
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get(ADDED_AT_COLUMN_NAME), appendedAt);
    const addedAtColumnIndex = headerMap.get(ADDED_AT_COLUMN_NAME);
    if (addedAtColumnIndex) {
      worksheet.getCell(nextRowIndex, addedAtColumnIndex).numFmt = ADDED_AT_NUMBER_FORMAT;
    }
    setRequiredCellValue(worksheet, nextRowIndex, headerMap.get(options.ignoreColumnName), "");

    existingKeys.add(key);
    appended += 1;
    nextRowIndex += 1;
  }

  if (!options.dryRun) {
    await workbook.xlsx.writeFile(options.workbookPath);
  }

  return {
    enabled: true,
    dryRun: Boolean(options.dryRun),
    workbookPath: options.workbookPath,
    sheetName: worksheet.name,
    totalCandidates: candidates.length,
    appended,
    existing,
    ignored,
    catalogueMatches
  };
}
