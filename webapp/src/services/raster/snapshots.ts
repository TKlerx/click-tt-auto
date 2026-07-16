import { prisma } from "@/lib/db";
import { rasterScopeWhere } from "@/lib/raster/access";
import type { Prisma } from "../../../generated/prisma/client";
import {
  derbySpieltag,
  rasterSizeForGroupSize,
} from "../../../../src/raster/rulebook/rulebook.ts";
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
type AssignmentLike = {
  id: string;
  league: string;
  group: string;
  clubId: string;
  clubName: string;
  team: string;
  rasterzahl: number;
};
type GroupModeLookup = Map<string, "single" | "double">;
type SeasonModelGroups = {
  groups?: Array<{
    ref?: { league?: string; name?: string };
    rasterMode?: "single" | "double";
  }>;
};

export type SnapshotPenaltyEvent = {
  id: string;
  kind: "SAME_CLUB_AFTER_ST3";
  severity: "PENALTY" | "HARD";
  clubId: string;
  clubName: string;
  league: string;
  group: string;
  spieltag: number;
  teams: string[];
};

export async function listSnapshots(scopeId: string) {
  return prisma.rasterSnapshot.findMany({
    where: { ...rasterScopeWhere(scopeId), archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      run: {
        select: { coverageComplete: true, coverageJson: true },
      },
      spannedScopes: {
        select: {
          scopeId: true,
          scope: { select: { code: true, name: true } },
        },
      },
    },
  });
}

export async function getSnapshot(id: string) {
  return prisma.rasterSnapshot.findFirst({
    where: { id, archivedAt: null },
    include: {
      scope: true,
      run: true,
      spannedScopes: {
        select: {
          scopeId: true,
          scope: { select: { code: true, name: true } },
        },
      },
    },
  });
}

export async function listSnapshotConflicts(
  snapshotId: string,
  filters: {
    scopeId?: string | null;
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
      ...(filters.scopeId
        ? { clubId: { startsWith: `${filters.scopeId}:` } }
        : {}),
      ...(filters.club ? { clubName: { contains: filters.club } } : {}),
      ...(filters.weekday ? { weekday: filters.weekday as never } : {}),
      ...(filters.hall ? { hall: filters.hall } : {}),
      ...(filters.week ? { matchWeek: filters.week } : {}),
      ...(filters.minExcess ? { excess: { gte: filters.minExcess } } : {}),
    },
    orderBy: [{ excess: "desc" }, { matchWeek: "asc" }],
  });
}

export async function listSnapshotPenaltyEvents(snapshotId: string) {
  const snapshot = await prisma.rasterSnapshot.findUnique({
    where: { id: snapshotId },
    include: { run: { include: { inputSet: true } } },
  });
  return findSameClubMatchPenalties(
    await prisma.rasterAssignment.findMany({
      where: { snapshotId },
      orderBy: [{ league: "asc" }, { group: "asc" }, { clubName: "asc" }],
    }),
    parseGroupModes(snapshot?.run?.inputSet.seasonModelJson),
  );
}

export function findSameClubMatchPenalties(
  assignments: AssignmentLike[],
  groupModes: GroupModeLookup = new Map(),
): SnapshotPenaltyEvent[] {
  const byGroup = new Map<string, AssignmentLike[]>();
  for (const row of assignments) {
    const key = `${row.league}\u0000${row.group}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
  }
  const events: SnapshotPenaltyEvent[] = [];

  for (const groupAssignments of byGroup.values()) {
    let rasterSize: ReturnType<typeof rasterSizeForGroupSize>;
    try {
      const group = groupAssignments[0]!;
      rasterSize = rasterSizeForGroupSize(
        groupAssignments.length,
        groupModes.get(`${group.league}\u0000${group.group}`),
      );
    } catch {
      continue;
    }

    for (const [leftIndex, left] of groupAssignments.entries()) {
      for (const right of groupAssignments.slice(leftIndex + 1)) {
        if (left.clubId !== right.clubId) continue;
        const spieltag = derbySpieltag(
          rasterSize,
          left.rasterzahl,
          right.rasterzahl,
        );
        if (spieltag === undefined || spieltag <= 3) continue;
        events.push({
          id: `${left.id}:${right.id}`,
          kind: "SAME_CLUB_AFTER_ST3",
          severity: spieltag === 4 ? "PENALTY" : "HARD",
          clubId: left.clubId,
          clubName: left.clubName,
          league: left.league,
          group: left.group,
          spieltag,
          teams: [left.team, right.team],
        });
      }
    }
  }

  return events.sort((left, right) => left.spieltag - right.spieltag);
}

function parseGroupModes(seasonModelJson?: string | null): GroupModeLookup {
  const modes: GroupModeLookup = new Map();
  if (!seasonModelJson) return modes;
  let parsed: SeasonModelGroups;
  try {
    parsed = JSON.parse(seasonModelJson) as SeasonModelGroups;
  } catch {
    return modes;
  }
  for (const group of parsed.groups ?? []) {
    if (group.ref?.league && group.ref.name && group.rasterMode) {
      modes.set(`${group.ref.league}\u0000${group.ref.name}`, group.rasterMode);
    }
  }
  return modes;
}

export async function summarizeSnapshotConflicts(
  snapshotId: string,
  filters: { scopeId?: string | null } = {},
) {
  const conflicts = await prisma.rasterConflict.findMany({
    where: {
      snapshotId,
      ...(filters.scopeId
        ? { clubId: { startsWith: `${filters.scopeId}:` } }
        : {}),
    },
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
    scopeId?: string | null;
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
      ...(filters.scopeId
        ? { clubId: { startsWith: `${filters.scopeId}:` } }
        : {}),
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
  scopeId: string;
  objectiveBreakdown?: string;
  assignments: ImportedAssignment[];
  conflicts: ImportedConflict[];
}) {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.rasterSnapshot.create({
      data: {
        scopeId: params.scopeId,
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
