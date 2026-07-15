import { prisma } from "@/lib/db";
import { getScenario } from "@/services/raster/scenarios";

export async function getScenarioDetails(id: string) {
  const scenario = await getScenario(id);
  if (!scenario) return null;
  const run = await prisma.rasterOptimizationRun.findUnique({
    where: { id },
    include: { snapshot: true },
  });
  const snapshotId = run?.snapshot?.id;
  if (!snapshotId) {
    return { scenario, assignments: [], conflicts: [] };
  }
  const [assignments, conflicts] = await Promise.all([
    prisma.rasterAssignment.findMany({
      where: { snapshotId },
      orderBy: [{ league: "asc" }, { group: "asc" }, { clubName: "asc" }],
    }),
    prisma.rasterConflict.findMany({
      where: { snapshotId },
      orderBy: [{ excess: "desc" }, { matchWeek: "asc" }],
    }),
  ]);
  return { scenario, assignments, conflicts };
}
