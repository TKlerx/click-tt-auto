import { objectiveBreakdownSchema } from "@/lib/raster/solver-io";

export type RasterKpiSummary = {
  objective: number | null;
  totalHallExcess: number;
  maxHallExcess: number;
  affectedClubs: number;
  wishMisses: number;
  sameClubDerbyIssues: number;
  status: string;
};

type SnapshotKpiSource = {
  totalExcess: number;
  maxExcess: number;
  affectedClubs: number;
  objectiveBreakdown: string;
  run?: {
    objectiveValue: number | null;
    outcome: string | null;
    solverStatus: string | null;
  } | null;
};

export function parseObjectiveBreakdown(value: string | null | undefined) {
  if (!value) return objectiveBreakdownSchema.parse({});
  try {
    return objectiveBreakdownSchema.parse(JSON.parse(value));
  } catch {
    return objectiveBreakdownSchema.parse({});
  }
}

export function kpiSummaryFromSnapshot(
  snapshot: SnapshotKpiSource,
): RasterKpiSummary {
  const breakdown = parseObjectiveBreakdown(snapshot.objectiveBreakdown);
  const wishMisses =
    Number(breakdown.wechsel ?? 0) + Number(breakdown.zeitgleich ?? 0);

  return {
    objective: snapshot.run?.objectiveValue ?? null,
    totalHallExcess: snapshot.totalExcess,
    maxHallExcess: snapshot.maxExcess,
    affectedClubs: snapshot.affectedClubs,
    wishMisses,
    sameClubDerbyIssues: Number(breakdown.sameClubDerbySt4 ?? 0),
    status: snapshot.run?.outcome ?? snapshot.run?.solverStatus ?? "completed",
  };
}
