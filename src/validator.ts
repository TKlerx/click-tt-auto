import { hasStructuredMfEvidenceInBemerkungen, mentionsMfInBemerkungen } from "./match-detail.js";
import type { MatchDetail, MatchEntry, ValidationCheck, ValidationResult } from "./types.js";

function pushCheck(checks: ValidationCheck[], rule: ValidationCheck["rule"], passed: boolean, reason?: string): void {
  checks.push(reason ? { rule, passed, reason } : { rule, passed });
}

function hasSixPlayers(detail: MatchDetail): { passed: boolean; reason?: string } {
  const homePositions = new Set(detail.homeTeam.players.map((player) => player.position));
  const guestPositions = new Set(detail.guestTeam.players.map((player) => player.position));
  const homePassed = detail.homeTeam.playerCount === 6 && homePositions.size === 6;
  const guestPassed = detail.guestTeam.playerCount === 6 && guestPositions.size === 6;

  if (homePassed && guestPassed) {
    return { passed: true };
  }

  const reasons: string[] = [];
  if (!homePassed) {
    reasons.push(`home has ${detail.homeTeam.playerCount} numbered players`);
  }
  if (!guestPassed) {
    reasons.push(`guest has ${detail.guestTeam.playerCount} numbered players`);
  }
  return { passed: false, reason: reasons.join("; ") };
}

function hasMfForBothTeams(detail: MatchDetail): { passed: boolean; reason?: string } {
  const structuredMfEvidence = hasStructuredMfEvidenceInBemerkungen(detail.bemerkungen);
  const homeHasMf =
    detail.homeTeam.hasMF || structuredMfEvidence || mentionsMfInBemerkungen(detail.homeTeam.teamName, detail.bemerkungen);
  const guestHasMf =
    detail.guestTeam.hasMF || structuredMfEvidence || mentionsMfInBemerkungen(detail.guestTeam.teamName, detail.bemerkungen);

  if (homeHasMf && guestHasMf) {
    return { passed: true };
  }

  const reasons: string[] = [];
  if (!homeHasMf) {
    reasons.push(`MF missing for ${detail.homeTeam.teamName}`);
  }
  if (!guestHasMf) {
    reasons.push(`MF missing for ${detail.guestTeam.teamName}`);
  }
  return { passed: false, reason: reasons.join("; ") };
}

export function validateMatch(match: MatchEntry, detail: MatchDetail): ValidationResult {
  const checks: ValidationCheck[] = [];

  const statusPassed = match.status.toLowerCase() === "abgeschlossen";
  pushCheck(checks, "status", statusPassed, statusPassed ? undefined : `status: ${match.status}`);

  const formatPassed = /Sechser-Paarkreuz-System/i.test(detail.matchFormat);
  pushCheck(checks, "match-format", formatPassed, formatPassed ? undefined : `unsupported format: ${detail.matchFormat || "unknown"}`);

  const errorPassed = !detail.hasErrorMessages;
  pushCheck(checks, "error-messages", errorPassed, errorPassed ? undefined : `error message found: ${detail.errorMessageText ?? "unexpected content"}`);

  const mfResult = hasMfForBothTeams(detail);
  pushCheck(checks, "mf-present", mfResult.passed, mfResult.reason);

  const playerResult = hasSixPlayers(detail);
  pushCheck(checks, "player-count", playerResult.passed, playerResult.reason);

  const alreadyApprovedPassed = !detail.isAlreadyApproved;
  pushCheck(checks, "already-approved", alreadyApprovedPassed, alreadyApprovedPassed ? undefined : "approval checkbox already checked");

  return {
    isApprovable: checks.every((check) => check.passed),
    checks
  };
}
