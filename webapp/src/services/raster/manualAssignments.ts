import { prisma } from "@/lib/db";
import { parseManualAssignmentPaste } from "@/lib/raster/manualAssignmentImport";
import {
  validateManualAssignmentRows,
  type ManualAssignmentRow,
} from "@/lib/raster/manualAssignments";
import { rasterIngest } from "@/lib/raster/pipeline";
import {
  AssignmentStatus,
  OptimizationRunOutcome,
  OptimizationRunStatus,
  RasterWeekday,
  SnapshotOptimality,
  SnapshotOrigin,
} from "../../../generated/prisma/enums";
import type { Assignment, SeasonModel } from "../../../../src/raster/types.ts";

export async function createManualAssignmentDraft(params: {
  inputSetId: string;
  createdById: string;
  name: string;
  rows: ManualAssignmentRow[];
}) {
  const inputSet = await prisma.rasterInputSet.findUniqueOrThrow({
    where: { id: params.inputSetId },
  });
  const validation = validateManualAssignmentRows(
    parseSeasonModel(inputSet.seasonModelJson),
    params.rows,
  );
  return prisma.rasterManualAssignmentDraft.create({
    data: {
      inputSetId: params.inputSetId,
      createdById: params.createdById,
      name: params.name.trim() || "Manual assignment",
      rowsJson: JSON.stringify(params.rows),
      validationIssuesJson: JSON.stringify(validation.issues),
    },
  });
}

export async function getManualAssignmentDraft(id: string) {
  return prisma.rasterManualAssignmentDraft.findUnique({
    where: { id },
    include: { inputSet: true },
  });
}

export async function validateManualAssignmentDraft(id: string) {
  const draft = await prisma.rasterManualAssignmentDraft.findUniqueOrThrow({
    where: { id },
    include: { inputSet: true },
  });
  const validation = validateManualAssignmentRows(
    parseSeasonModel(draft.inputSet.seasonModelJson),
    parseRows(draft.rowsJson),
  );
  await prisma.rasterManualAssignmentDraft.update({
    where: { id },
    data: { validationIssuesJson: JSON.stringify(validation.issues) },
  });
  return validation;
}

export async function scoreManualAssignmentDraft(id: string, userId: string) {
  const draft = await prisma.rasterManualAssignmentDraft.findUniqueOrThrow({
    where: { id },
    include: { inputSet: true },
  });
  const model = parseSeasonModel(draft.inputSet.seasonModelJson);
  const validation = validateManualAssignmentRows(
    model,
    parseRows(draft.rowsJson),
  );
  if (validation.issues.length) return { issues: validation.issues, run: null };

  const result = await rasterIngest.scoreAssignment(
    model,
    validation.assignment,
  );
  if (result.hardViolations.length) {
    throw new Error(
      result.hardViolations.map((violation) => violation.detail).join("; "),
    );
  }
  const objectiveBreakdown = JSON.stringify(result.objectiveBreakdown);
  const conflicts = result.overUsages.filter((row) => row.excess > 0);

  const run = await prisma.$transaction(async (tx) => {
    const createdRun = await tx.rasterOptimizationRun.create({
      data: {
        inputSetId: draft.inputSetId,
        startedById: userId,
        status: OptimizationRunStatus.SUCCEEDED,
        outcome: OptimizationRunOutcome.FEASIBLE,
        objectiveValue: result.objective,
        objectiveBreakdown,
        solverStatus: "MANUAL",
        settings: JSON.stringify({
          strategy: "manual",
          name: draft.name,
          manualAssignmentDraftId: draft.id,
        }),
        finishedAt: new Date(),
      },
    });
    const snapshot = await tx.rasterSnapshot.create({
      data: {
        runId: createdRun.id,
        district: draft.inputSet.district,
        origin: SnapshotOrigin.IMPORTED,
        optimality: SnapshotOptimality.IMPORTED_HEURISTIC,
        totalConflicts: conflicts.length,
        totalExcess: conflicts.reduce((sum, row) => sum + row.excess, 0),
        maxExcess: Math.max(0, ...conflicts.map((row) => row.excess)),
        affectedClubs: new Set(conflicts.map((row) => row.clubId)).size,
        objectiveBreakdown,
      },
    });
    await tx.rasterAssignment.createMany({
      data: assignmentRows(snapshot.id, model, validation.assignment),
    });
    if (conflicts.length) {
      await tx.rasterConflict.createMany({
        data: conflicts.map((row) => ({
          snapshotId: snapshot.id,
          matchWeek: row.week,
          clubId: row.clubId,
          clubName:
            model.clubs.find((club) => club.id === row.clubId)?.name ??
            row.clubId,
          weekday: row.weekday.toUpperCase() as RasterWeekday,
          hall: row.hall,
          capacity: row.capacity,
          actualCount: row.teams.length,
          excess: row.excess,
          teams: JSON.stringify(row.teams),
        })),
      });
    }
    return createdRun;
  });

  return { issues: [], run };
}

export function rowsFromManualAssignmentInput(input: {
  rows?: unknown;
  paste?: unknown;
}): ManualAssignmentRow[] {
  if (Array.isArray(input.rows)) return input.rows as ManualAssignmentRow[];
  return parseManualAssignmentPaste(String(input.paste ?? ""));
}

function parseRows(value: string): ManualAssignmentRow[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as ManualAssignmentRow[]) : [];
  } catch {
    return [];
  }
}

function parseSeasonModel(value: string | null): SeasonModel {
  if (!value) throw new Error("Input set has no season model");
  return JSON.parse(value) as SeasonModel;
}

function assignmentRows(
  snapshotId: string,
  model: SeasonModel,
  assignment: Assignment,
) {
  const clubs = new Map(model.clubs.map((club) => [club.id, club]));
  return model.groups.flatMap((group) =>
    group.teamIds.flatMap((teamId) => {
      const team = model.teams.find((candidate) => candidate.id === teamId);
      if (!team) return [];
      const club = clubs.get(team.clubId);
      return [
        {
          snapshotId,
          league: group.ref.league,
          group: group.ref.name,
          clubId: team.clubId,
          clubName: club?.name ?? team.clubId,
          team: team.name ?? team.label,
          rasterzahl: assignment[teamId] ?? 0,
          status: AssignmentStatus.OPTIMIZED,
          weekday: team.homeWeekday.toUpperCase() as RasterWeekday,
          hall: team.hall,
          startTime: team.startTime,
          weekSlot: team.spielwochePref,
        },
      ];
    }),
  );
}
