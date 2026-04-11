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
}

export interface MatchDetail {
  matchFormat: string;
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
  totalApproved: number;
  totalSkipped: number;
  totalAlreadyApproved: number;
  totalErrors: number;
  actions: MatchAction[];
  reportPath?: string;
}

export interface AppConfig {
  username: string;
  password: string;
  baseUrl: string;
  dryRun: boolean;
  debug: boolean;
  headed: boolean;
  haltOnError: boolean;
  plainProgress: boolean;
  slowMoMs: number;
  group: string | null;
  reportDir: string;
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
