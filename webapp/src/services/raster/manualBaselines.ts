import { prisma } from "@/lib/db";
import { rasterIngest } from "@/lib/raster/pipeline";
import type { BaselineRowDecisionInput } from "@/lib/raster/schemas";
import type { TeamRasterAssignmentRow } from "../../../../src/raster/ingest/clicktt-assignments.js";
import type { SeasonModel } from "../../../../src/raster/types.js";

export class BaselineImportConflictError extends Error {}
export class BaselineImportEmptyError extends Error {}
export class BaselineImportError extends Error {}
export class BaselineValidationError extends Error {}

type PreparedRow = {
  sourceIdentityKey: string;
  sourceGroupLabel: string;
  sourceTeamLabel: string;
  rasterzahl: number;
  sourceLocation: string;
  importedAt: Date;
  status: "MATCHED" | "REVIEW" | "IGNORED" | "ACCEPTED_UNRESOLVED" | "INVALID";
  targetTeamId: string | null;
  targetTeamLabel: string | null;
  issue: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
};

export type BaselineComparisonRow = {
  teamId: string;
  teamLabel: string;
  baselineRasterzahl: number | null;
  resultRasterzahl: number | null;
  state: "unchanged" | "changed" | "new" | "missing";
};

export function normalizeBaselineIdentity(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de");
}

export function baselineSourceIdentity(group: string, team: string) {
  return JSON.stringify([
    normalizeBaselineIdentity(group),
    normalizeBaselineIdentity(team),
  ]);
}

function parseSeasonModel(value: string | null): SeasonModel {
  if (!value)
    throw new BaselineValidationError("The workspace has no season model.");
  try {
    return JSON.parse(value) as SeasonModel;
  } catch {
    throw new BaselineValidationError("The workspace season model is invalid.");
  }
}

function rasterSize(groupSize: number) {
  if (groupSize >= 5 && groupSize <= 6) return 6;
  if (groupSize <= 8) return 8;
  if (groupSize <= 10) return 10;
  if (groupSize <= 12) return 12;
  return null;
}

// ponytail: keep the one-pass classification together; split only if another importer reuses part of it.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function prepareManualBaselineRows(
  sourceRows: TeamRasterAssignmentRow[],
  model: SeasonModel,
  previousRows: Array<{
    sourceIdentityKey: string;
    status: string;
    targetTeamId: string | null;
    targetTeamLabel: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
  }> = [],
) {
  const groups = new Map(
    model.groups.map((group) => [
      normalizeBaselineIdentity(group.ref.name),
      group,
    ]),
  );
  const priorByIdentity = new Map(
    previousRows.map((row) => [row.sourceIdentityKey, row]),
  );
  const validTeamIds = new Set(model.teams.map((team) => team.id));
  const baseCounts = new Map<string, number>();
  for (const row of sourceRows) {
    const base = baselineSourceIdentity(row.league ?? row.group, row.team);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  let rejectedCount = 0;
  const importedAt = new Date();
  const rows: PreparedRow[] = [];

  for (const source of sourceRows) {
    const sourceGroupLabel = source.league ?? source.group;
    const groupKey = normalizeBaselineIdentity(sourceGroupLabel);
    const group = groups.get(groupKey);
    if (!group) {
      rejectedCount += 1;
      continue;
    }
    const base = baselineSourceIdentity(sourceGroupLabel, source.team);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const sourceIdentityKey = occurrence === 1 ? base : `${base}#${occurrence}`;
    const candidates = model.teams.filter(
      (team) =>
        [team.name, team.label].some(
          (label) =>
            normalizeBaselineIdentity(label ?? "") ===
            normalizeBaselineIdentity(source.team),
        ) && normalizeBaselineIdentity(team.group?.name ?? "") === groupKey,
    );
    const max = rasterSize(group.size);
    const invalidRange =
      !Number.isInteger(source.rasterzahl) ||
      source.rasterzahl < 1 ||
      max === null ||
      source.rasterzahl > max;
    const duplicate = (baseCounts.get(base) ?? 0) > 1;
    const prior = priorByIdentity.get(sourceIdentityKey);
    let status: PreparedRow["status"] = invalidRange ? "INVALID" : "REVIEW";
    let targetTeamId: string | null = null;
    let targetTeamLabel: string | null = null;
    let issue: string | null = invalidRange
      ? `Rasterzahl ${source.rasterzahl} is outside the group range 1-${max ?? "?"}.`
      : duplicate
        ? "Duplicate source team identity."
        : candidates.length === 0
          ? "No exact season-model team match."
          : candidates.length > 1
            ? "Multiple exact season-model team matches."
            : null;
    let reviewedById: string | null = null;
    let reviewedAt: Date | null = null;

    if (!invalidRange && !duplicate && candidates.length === 1) {
      status = "MATCHED";
      targetTeamId = candidates[0]!.id;
      targetTeamLabel = candidates[0]!.name ?? candidates[0]!.label;
    }
    if (
      !invalidRange &&
      !duplicate &&
      prior &&
      (prior.status === "IGNORED" || prior.status === "ACCEPTED_UNRESOLVED")
    ) {
      status = prior.status;
      reviewedById = prior.reviewedById;
      reviewedAt = prior.reviewedAt;
      issue = null;
    } else if (
      !invalidRange &&
      !duplicate &&
      prior?.targetTeamId &&
      validTeamIds.has(prior.targetTeamId)
    ) {
      status = "MATCHED";
      targetTeamId = prior.targetTeamId;
      targetTeamLabel = prior.targetTeamLabel;
      reviewedById = prior.reviewedById;
      reviewedAt = prior.reviewedAt;
      issue = null;
    }

    rows.push({
      sourceIdentityKey,
      sourceGroupLabel,
      sourceTeamLabel: source.team,
      rasterzahl: source.rasterzahl,
      sourceLocation: source.sourceUrl,
      importedAt,
      status,
      targetTeamId,
      targetTeamLabel,
      issue,
      reviewedById,
      reviewedAt,
    });
  }
  return { rows, rejectedCount };
}

export function countBaselineRows(rows: Array<{ status: string }>) {
  const counts = {
    total: rows.length,
    matched: 0,
    review: 0,
    ignored: 0,
    acceptedUnresolved: 0,
    invalid: 0,
  };
  for (const row of rows) {
    if (row.status === "MATCHED") counts.matched += 1;
    else if (row.status === "REVIEW") counts.review += 1;
    else if (row.status === "IGNORED") counts.ignored += 1;
    else if (row.status === "ACCEPTED_UNRESOLVED")
      counts.acceptedUnresolved += 1;
    else if (row.status === "INVALID") counts.invalid += 1;
  }
  return counts;
}

function readyStatus(rows: Array<{ status: string }>) {
  return rows.every((row) =>
    ["MATCHED", "IGNORED", "ACCEPTED_UNRESOLVED"].includes(row.status),
  )
    ? "READY"
    : "REVIEW";
}

export async function getManualBaseline(inputSetId: string) {
  const versions = await prisma.rasterManualBaseline.findMany({
    where: { inputSetId },
    include: {
      rows: {
        orderBy: [{ sourceGroupLabel: "asc" }, { sourceTeamLabel: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const active = versions.find((version) => version.active) ?? null;
  return {
    active,
    versions: versions.map(({ rows, ...version }) => ({
      ...version,
      counts: countBaselineRows(rows),
    })),
    counts: active ? countBaselineRows(active.rows) : countBaselineRows([]),
  };
}

export async function importManualBaseline(params: {
  inputSetId: string;
  startedById: string;
  scrape?: typeof rasterIngest.scrapeClickTtAssignments;
}) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: params.inputSetId },
    include: { scope: true },
  });
  if (!inputSet) throw new BaselineValidationError("Input set not found.");
  const model = parseSeasonModel(inputSet.seasonModelJson);
  let attempt;
  try {
    attempt = await prisma.rasterManualBaseline.create({
      data: { inputSetId: inputSet.id, startedById: params.startedById },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new BaselineImportConflictError(
        "A baseline import is already running.",
      );
    }
    throw error;
  }

  try {
    const previous = await prisma.rasterManualBaseline.findFirst({
      where: { inputSetId: inputSet.id, active: true },
      include: { rows: true },
    });
    const scraped = await (
      params.scrape ?? rasterIngest.scrapeClickTtAssignments
    )();
    const prepared = prepareManualBaselineRows(
      scraped,
      model,
      previous?.rows ?? [],
    );
    if (!prepared.rows.length) {
      throw new BaselineImportEmptyError(
        "No context-valid baseline rows were found.",
      );
    }
    const status = readyStatus(prepared.rows);
    const completedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.rasterManualBaselineRow.createMany({
        data: prepared.rows.map((row) => ({ ...row, baselineId: attempt.id })),
      });
      await tx.rasterManualBaseline.updateMany({
        where: { inputSetId: inputSet.id, active: true },
        data: { active: false },
      });
      await tx.rasterManualBaseline.update({
        where: { id: attempt.id },
        data: {
          active: true,
          status,
          completedAt,
          activatedAt: completedAt,
          sourceSummaryJson: JSON.stringify({
            scope: inputSet.scope.code,
            season: inputSet.season,
            groups: new Set(prepared.rows.map((row) => row.sourceGroupLabel))
              .size,
            rows: prepared.rows.length,
            rejectedRows: prepared.rejectedCount,
          }),
        },
      });
    });
    return getManualBaseline(inputSet.id);
  } catch (error) {
    await prisma.rasterManualBaseline.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorJson: JSON.stringify({
          step: "authenticated-live-navigation",
          message:
            error instanceof BaselineImportEmptyError
              ? error.message
              : "click-TT baseline import failed.",
        }),
      },
    });
    if (error instanceof BaselineImportEmptyError) throw error;
    throw new BaselineImportError("click-TT baseline import failed.");
  }
}

export async function reviewManualBaselineRow(params: {
  inputSetId: string;
  rowId: string;
  reviewedById: string;
  decision: BaselineRowDecisionInput;
}) {
  const row = await prisma.rasterManualBaselineRow.findFirst({
    where: {
      id: params.rowId,
      baseline: { inputSetId: params.inputSetId, active: true },
    },
    include: { baseline: { include: { inputSet: true } } },
  });
  if (!row) throw new BaselineValidationError("Active baseline row not found.");
  let data;
  if (params.decision.decision === "map") {
    const model = parseSeasonModel(row.baseline.inputSet.seasonModelJson);
    const targetTeamId = params.decision.targetTeamId;
    const team = model.teams.find((candidate) => candidate.id === targetTeamId);
    if (!team)
      throw new BaselineValidationError(
        "Target team is not in this workspace season model.",
      );
    data = {
      status: "MATCHED" as const,
      targetTeamId: team.id,
      targetTeamLabel: team.name ?? team.label,
      issue: null,
    };
  } else if (params.decision.decision === "ignore") {
    data = {
      status: "IGNORED" as const,
      targetTeamId: null,
      targetTeamLabel: null,
      issue: null,
    };
  } else {
    data = {
      status: "ACCEPTED_UNRESOLVED" as const,
      targetTeamId: null,
      targetTeamLabel: null,
      issue: null,
    };
  }
  const reviewedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.rasterManualBaselineRow.update({
      where: { id: row.id },
      data: { ...data, reviewedById: params.reviewedById, reviewedAt },
    });
    const rows = await tx.rasterManualBaselineRow.findMany({
      where: { baselineId: row.baselineId },
    });
    const status = readyStatus(rows);
    await tx.rasterManualBaseline.update({
      where: { id: row.baselineId },
      data: { status },
    });
    return { row: updated, status, counts: countBaselineRows(rows) };
  });
}

export function projectBaselineComparison(
  baselineRows: Array<{
    targetTeamId: string | null;
    targetTeamLabel: string | null;
    rasterzahl: number;
    status: string;
  }>,
  assignments: Array<{
    team: string;
    rasterzahl: number;
    clubId?: string;
    league?: string;
    group?: string;
    teamId?: string;
  }>,
  assignmentTeamIds: Map<string, string> = new Map(
    assignments.map((row) => [row.team, row.team]),
  ),
) {
  const baseline = new Map(
    baselineRows
      .filter((row) => row.status === "MATCHED" && row.targetTeamId)
      .map((row) => [row.targetTeamId!, row]),
  );
  const result = new Map(
    assignments.map((row) => [
      row.teamId ??
        assignmentTeamIds.get(row.team) ??
        baselineSourceIdentity(
          [row.league, row.group].filter(Boolean).join(" / "),
          row.team,
        ),
      row,
    ]),
  );
  const teamIds = new Set([...baseline.keys(), ...result.keys()]);
  const rows: BaselineComparisonRow[] = [...teamIds].map((teamId) => {
    const before = baseline.get(teamId);
    const after = result.get(teamId);
    return {
      teamId,
      teamLabel: before?.targetTeamLabel ?? after?.team ?? teamId,
      baselineRasterzahl: before?.rasterzahl ?? null,
      resultRasterzahl: after?.rasterzahl ?? null,
      state: !before
        ? "new"
        : !after
          ? "missing"
          : before.rasterzahl === after.rasterzahl
            ? "unchanged"
            : "changed",
    };
  });
  return {
    counts: {
      unchanged: rows.filter((row) => row.state === "unchanged").length,
      changed: rows.filter((row) => row.state === "changed").length,
      new: rows.filter((row) => row.state === "new").length,
      missing: rows.filter((row) => row.state === "missing").length,
    },
    rows,
  };
}

export async function getSnapshotBaselineComparison(snapshotId: string) {
  const snapshot = await prisma.rasterSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      assignments: true,
      run: {
        include: { baseline: { include: { rows: true } }, inputSet: true },
      },
    },
  });
  if (!snapshot?.run?.baseline) return null;
  const model = parseSeasonModel(snapshot.run.inputSet.seasonModelJson);
  const assignments = snapshot.assignments.map((assignment) => {
    const candidates = model.teams.filter(
      (team) =>
        [team.name, team.label].some(
          (label) =>
            normalizeBaselineIdentity(label ?? "") ===
            normalizeBaselineIdentity(assignment.team),
        ) &&
        (normalizeBaselineIdentity(team.group?.name ?? "") ===
          normalizeBaselineIdentity(assignment.group) ||
          normalizeBaselineIdentity(team.group?.league ?? "") ===
            normalizeBaselineIdentity(assignment.league)),
    );
    return {
      ...assignment,
      teamId: candidates.length === 1 ? candidates[0]!.id : undefined,
    };
  });
  return {
    baselineId: snapshot.run.baseline.id,
    ...projectBaselineComparison(snapshot.run.baseline.rows, assignments),
  };
}
