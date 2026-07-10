import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import type { Prisma } from "../../../generated/prisma/client";
import {
  SnapshotOptimality,
  SnapshotOrigin,
  type ReviewDecisionStatus,
} from "../../../generated/prisma/enums";

type ImportedAssignment = Omit<
  Prisma.RasterAssignmentCreateManyInput,
  "snapshotId"
>;
type ImportedConflict = Omit<
  Prisma.RasterConflictCreateManyInput,
  "snapshotId"
>;

export async function listSnapshots(district: string) {
  return prisma.rasterSnapshot.findMany({
    where: rasterDistrictWhere(district),
    orderBy: { createdAt: "desc" },
  });
}

export async function getSnapshot(id: string) {
  return prisma.rasterSnapshot.findUnique({ where: { id } });
}

export async function listSnapshotConflicts(
  snapshotId: string,
  filters: {
    club?: string | null;
    weekday?: string | null;
    hall?: string | null;
    week?: number | null;
    minExcess?: number | null;
  } = {},
) {
  return prisma.rasterConflict.findMany({
    where: {
      snapshotId,
      ...(filters.club ? { clubName: { contains: filters.club } } : {}),
      ...(filters.weekday ? { weekday: filters.weekday as never } : {}),
      ...(filters.hall ? { hall: filters.hall } : {}),
      ...(filters.week ? { matchWeek: filters.week } : {}),
      ...(filters.minExcess ? { excess: { gte: filters.minExcess } } : {}),
    },
    orderBy: [{ excess: "desc" }, { matchWeek: "asc" }],
  });
}

export async function summarizeSnapshotConflicts(snapshotId: string) {
  const conflicts = await prisma.rasterConflict.findMany({
    where: { snapshotId },
    select: { clubId: true, clubName: true, excess: true },
  });
  const byClub = new Map<
    string,
    { clubId: string; clubName: string; excess: number; rows: number }
  >();

  for (const conflict of conflicts) {
    const current = byClub.get(conflict.clubId) ?? {
      clubId: conflict.clubId,
      clubName: conflict.clubName,
      excess: 0,
      rows: 0,
    };
    current.excess += conflict.excess;
    current.rows += 1;
    byClub.set(conflict.clubId, current);
  }

  return [...byClub.values()].sort((left, right) => right.excess - left.excess);
}

export async function listSnapshotAssignments(
  snapshotId: string,
  filters: {
    club?: string | null;
    league?: string | null;
    group?: string | null;
    team?: string | null;
    status?: string | null;
  } = {},
) {
  return prisma.rasterAssignment.findMany({
    where: {
      snapshotId,
      ...(filters.club ? { clubName: { contains: filters.club } } : {}),
      ...(filters.league ? { league: { contains: filters.league } } : {}),
      ...(filters.group ? { group: { contains: filters.group } } : {}),
      ...(filters.team ? { team: { contains: filters.team } } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
    },
    orderBy: [{ league: "asc" }, { group: "asc" }, { clubName: "asc" }],
  });
}

export async function createReviewDecision(params: {
  snapshotId: string;
  targetType: "CONFLICT" | "CLUB_SUMMARY";
  targetId: string;
  status: ReviewDecisionStatus;
  note?: string;
  decidedById: string;
}) {
  return prisma.rasterReviewDecision.create({ data: params });
}

export async function importSnapshot(params: {
  district: string;
  objectiveBreakdown?: string;
  assignments: ImportedAssignment[];
  conflicts: ImportedConflict[];
}) {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.rasterSnapshot.create({
      data: {
        district: params.district,
        origin: SnapshotOrigin.IMPORTED,
        optimality: SnapshotOptimality.IMPORTED_HEURISTIC,
        totalConflicts: params.conflicts.length,
        totalExcess: params.conflicts.reduce((sum, row) => sum + row.excess, 0),
        maxExcess: Math.max(0, ...params.conflicts.map((row) => row.excess)),
        affectedClubs: new Set(params.conflicts.map((row) => row.clubId)).size,
        objectiveBreakdown: params.objectiveBreakdown ?? "{}",
      },
    });
    if (params.assignments.length) {
      await tx.rasterAssignment.createMany({
        data: params.assignments.map((row) => ({
          ...row,
          snapshotId: snapshot.id,
        })),
      });
    }
    if (params.conflicts.length) {
      await tx.rasterConflict.createMany({
        data: params.conflicts.map((row) => ({
          ...row,
          snapshotId: snapshot.id,
        })),
      });
    }
    return snapshot;
  });
}
