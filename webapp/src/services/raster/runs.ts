import { prisma } from "@/lib/db";
import { buildCoverageRecordForInputSet } from "@/lib/raster/coverage";
import type { RunSettingsInput } from "@/lib/raster/schemas";
import { syncInputSetSourceCaches } from "./inputSets";

export async function listOptimizationRuns(inputSetId: string) {
  return prisma.rasterOptimizationRun.findMany({
    where: { inputSetId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOptimizationRun(id: string) {
  return prisma.rasterOptimizationRun.findUnique({
    where: { id },
    include: { inputSet: { include: { scope: true } }, snapshot: true },
  });
}

export async function cancelOptimizationRun(id: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.rasterOptimizationRun.update({
      where: { id },
      data: {
        status: "CANCELLED",
        outcome: "CANCELLED",
        finishedAt: new Date(),
      },
    });
    if (run.jobId) {
      await tx.backgroundJob.updateMany({
        where: {
          id: run.jobId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: {
          status: "FAILED",
          error: "Raster optimization run cancelled.",
          lockedAt: null,
          finishedAt: new Date(),
        },
      });
    }
    return run;
  });
}

export async function archiveOptimizationRun(id: string) {
  const archivedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.rasterSnapshot.updateMany({
      where: { runId: id },
      data: { archivedAt },
    });
    return tx.rasterOptimizationRun.update({
      where: { id },
      data: { archivedAt },
    });
  });
}

export async function startOptimizationRun(params: {
  inputSetId: string;
  startedById: string;
  settings: RunSettingsInput;
}) {
  await syncInputSetSourceCaches(params.inputSetId);
  const coverage = await buildCoverageRecordForInputSet(params.inputSetId);
  return prisma.$transaction(async (tx) => {
    const unresolvedWishConflicts =
      (await tx.rasterWishConflict.findMany({
        where: { inputSetId: params.inputSetId, decision: null },
        select: { id: true, wishId: true, importedRowId: true },
      })) ?? [];
    const coverageWithWishConflicts = {
      ...coverage,
      complete: coverage.complete && unresolvedWishConflicts.length === 0,
      unresolvedWishConflicts: {
        count: unresolvedWishConflicts.length,
        conflicts: unresolvedWishConflicts,
      },
    };
    const run = await tx.rasterOptimizationRun.create({
      data: {
        inputSetId: params.inputSetId,
        startedById: params.startedById,
        settings: JSON.stringify(params.settings),
        coverageComplete: coverageWithWishConflicts.complete,
        coverageJson: JSON.stringify(coverageWithWishConflicts),
      },
    });
    const job = await tx.backgroundJob.create({
      data: {
        jobType: "raster_run",
        payload: JSON.stringify({ runId: run.id }),
        createdByUserId: params.startedById,
      },
    });
    return tx.rasterOptimizationRun.update({
      where: { id: run.id },
      data: { jobId: job.id },
    });
  });
}
