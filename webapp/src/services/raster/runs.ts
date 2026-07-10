import { prisma } from "@/lib/db";
import type { RunSettingsInput } from "@/lib/raster/schemas";

export async function listOptimizationRuns(inputSetId: string) {
  return prisma.rasterOptimizationRun.findMany({
    where: { inputSetId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOptimizationRun(id: string) {
  return prisma.rasterOptimizationRun.findUnique({
    where: { id },
    include: { inputSet: true, snapshot: true },
  });
}

export async function cancelOptimizationRun(id: string) {
  return prisma.rasterOptimizationRun.update({
    where: { id },
    data: {
      status: "CANCELLED",
      outcome: "CANCELLED",
      finishedAt: new Date(),
    },
  });
}

export async function startOptimizationRun(params: {
  inputSetId: string;
  startedById: string;
  settings: RunSettingsInput;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.rasterOptimizationRun.create({
      data: {
        inputSetId: params.inputSetId,
        startedById: params.startedById,
        settings: JSON.stringify(params.settings),
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
