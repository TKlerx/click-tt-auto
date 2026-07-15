import {
  numericRasterSize,
  rasterSizeForGroupSize,
} from "../../../../src/raster/rulebook/rulebook.ts";
import type { SeasonModel } from "../../../../src/raster/types.ts";

export type ManualAssignmentRow = {
  teamId?: string;
  teamLabel?: string;
  rasterzahl: number;
};

export type ManualAssignmentIssue = {
  code:
    | "unknown_team"
    | "missing_team"
    | "duplicate_team"
    | "duplicate_rasterzahl"
    | "illegal_rasterzahl";
  message: string;
  teamId?: string;
  teamLabel?: string;
};

export function validateManualAssignmentRows(
  model: SeasonModel,
  rows: ManualAssignmentRow[],
) {
  const issues: ManualAssignmentIssue[] = [];
  const assignment = resolveManualAssignmentRows(model, rows, issues);

  for (const group of model.groups) {
    const maxRasterzahl = numericRasterSize(
      rasterSizeForGroupSize(group.size, group.rasterMode),
    );
    const used = new Map<number, string>();
    for (const teamId of group.teamIds) {
      const rasterzahl = assignment[teamId];
      const team = model.teams.find((candidate) => candidate.id === teamId);
      if (rasterzahl === undefined) {
        issues.push({
          code: "missing_team",
          message: `${team?.label ?? teamId} is missing a schedule number.`,
          teamId,
        });
        continue;
      }
      if (rasterzahl < 1 || rasterzahl > maxRasterzahl) {
        issues.push({
          code: "illegal_rasterzahl",
          message: `${team?.label ?? teamId} uses ${rasterzahl}, expected 1..${maxRasterzahl}.`,
          teamId,
        });
      }
      const otherTeamId = used.get(rasterzahl);
      if (otherTeamId) {
        issues.push({
          code: "duplicate_rasterzahl",
          message: `${team?.label ?? teamId} duplicates schedule number ${rasterzahl} in ${group.ref.league} / ${group.ref.name}.`,
          teamId,
        });
      }
      used.set(rasterzahl, teamId);
    }
  }

  return { assignment, issues };
}

function resolveManualAssignmentRows(
  model: SeasonModel,
  rows: ManualAssignmentRow[],
  issues: ManualAssignmentIssue[],
) {
  const assignment: Record<string, number> = {};
  const seenTeams = new Set<string>();

  for (const row of rows) {
    const team = findManualTeam(model, row);
    if (!team) {
      issues.push({
        code: "unknown_team",
        message: `${row.teamLabel ?? row.teamId ?? "Row"} does not match a team.`,
        teamId: row.teamId,
        teamLabel: row.teamLabel,
      });
      continue;
    }
    if (seenTeams.has(team.id)) {
      issues.push({
        code: "duplicate_team",
        message: `${team.label} appears more than once.`,
        teamId: team.id,
      });
      continue;
    }
    seenTeams.add(team.id);
    assignment[team.id] = row.rasterzahl;
  }

  return assignment;
}

function findManualTeam(model: SeasonModel, row: ManualAssignmentRow) {
  if (row.teamId) {
    const byId = model.teams.find((team) => team.id === row.teamId);
    if (byId) return byId;
  }
  const label = normalize(row.teamLabel);
  if (!label) return null;
  return (
    model.teams.find(
      (team) =>
        normalize(team.label) === label ||
        normalize(team.name) === label ||
        normalize(`${team.group?.league ?? ""} ${team.label}`) === label,
    ) ?? null
  );
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}
