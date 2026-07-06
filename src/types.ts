export interface Player {
  position: number;
  name: string;
  rank: string;
}

export interface TeamLineup {
  teamName: string;
  hasMF: boolean;
  mfName?: string;
  playerCount: number;
  players: Player[];
}

export interface MatchEntry {
  index: number;
  date: string;
  homeTeam: string;
  guestTeam: string;
  scoreHome: number;
  scoreGuest: number;
  status: string;
  points: string;
  isApproved: boolean;
  erfassenUrl: string;
  group: string;
  liga?: string;
  gruppe?: string;
}

export interface MatchDetail {
  matchFormat: string;
  competitionName?: string;
  competitionLiga?: string;
  competitionGruppe?: string;
  homeTeam: TeamLineup;
  guestTeam: TeamLineup;
  hasErrorMessages: boolean;
  errorMessageText?: string;
  bemerkungen: string;
  isAlreadyApproved: boolean;
}

export type ValidationRule =
  | "status"
  | "match-format"
  | "error-messages"
  | "mf-present"
  | "player-count"
  | "already-approved";

export interface ValidationCheck {
  rule: ValidationRule;
  passed: boolean;
  reason?: string;
}

export interface ValidationResult {
  isApprovable: boolean;
  checks: ValidationCheck[];
}

export type MatchActionType = "approved" | "skipped" | "already-approved" | "error";

export interface MatchAction {
  match: MatchEntry;
  action: MatchActionType;
  validation?: ValidationResult;
  error?: string;
}

export interface RunReport {
  timestamp: string;
  dryRun: boolean;
  group: string | null;
  totalFound: number;
  totalScanned: number;
  totalOpened: number;
  totalActionable: number;
  totalIgnored: number;
  totalApproved: number;
  totalSkipped: number;
  totalAlreadyApproved: number;
  totalErrors: number;
  actions: MatchAction[];
  fineSync?: FineSyncResult;
  reportPath?: string;
}

export interface AppConfig {
  username: string;
  password: string;
  baseUrl: string;
  dryRun: boolean;
  processAll: boolean;
  debug: boolean;
  headed: boolean;
  haltOnError: boolean;
  plainProgress: boolean;
  slowMoMs: number;
  group: string | null;
  reportDir: string;
  fineWorkbookPath: string | null;
  fineSheetName: string | null;
  fineIgnoreColumn: string;
  fineSpielleiter: string | null;
  fineLiga: string | null;
  fineGruppe: string | null;
  fineNaKosten: number;
  fineCataloguePath: string | null;
  fineCatalogue: FineCatalogue | null;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
}

export interface ParsedMatchListPage {
  allMatches: MatchEntry[];
  matches: MatchEntry[];
  pagination: PaginationInfo;
  totalMatches: number;
}

export interface FineCandidate {
  liga: string;
  gruppe: string;
  serie: string;
  datum: Date | string;
  spielnummer: string;
  heim: string;
  gast: string;
  strafeGegen: string;
  grund: string;
  rechtsgrundlage: string;
  clickTtText: string;
  bemerkung: string;
  kosten: number | string;
  spielleiter: string;
  eingetragenAm: Date | string;
  fineEvent: string;
  fineSeason: string;
  fineCatalogueMatched: boolean;
  fineCataloguePattern: string;
  fineLowestTeamApplied: boolean;
}

export interface FineCatalogueFineDetails {
  grund?: string;
  rechtsgrundlage?: string;
  kosten?: number | string;
}

export interface FineCatalogueEntry extends FineCatalogueFineDetails {
  patterns?: FineCataloguePattern[];
  lowestTeam?: FineCatalogueFineDetails;
}

export interface FineCataloguePattern extends FineCatalogueFineDetails {
  match: string;
}

export interface FineCatalogueLeague {
  events?: Record<string, FineCatalogueEntry>;
  lowestTeams?: string[];
}

export interface FineCatalogueSeason {
  events?: Record<string, FineCatalogueEntry>;
  leagues?: Record<string, FineCatalogueLeague>;
  lowestTeams?: string[];
}

export interface FineCatalogue {
  seasons: Record<string, FineCatalogueSeason>;
}

export interface FineSyncResult {
  enabled: boolean;
  dryRun?: boolean;
  workbookPath?: string;
  sheetName?: string;
  totalCandidates: number;
  appended: number;
  existing: number;
  ignored: number;
  catalogueMatches?: FineCatalogueMatchSummary[];
  error?: string;
}

export interface FineCatalogueMatchSummary {
  state: "appended" | "existing" | "ignored" | "would-append";
  event: string;
  season: string;
  liga: string;
  gruppe: string;
  match: string;
  strafeGegen: string;
  grund: string;
  rechtsgrundlage: string;
  kosten: number | string;
  clickTtText: string;
  catalogueMatched: boolean;
  pattern: string;
  lowestTeamApplied: boolean;
}
