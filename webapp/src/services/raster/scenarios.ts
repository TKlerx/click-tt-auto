import { prisma } from "@/lib/db";
import { kpiSummaryFromSnapshot } from "@/lib/raster/kpis";
import type {
  RasterScenario,
  ScenarioStatus,
  ScenarioStrategy,
} from "@/lib/raster/scenarios";

type ScenarioFilters = {
  district?: string;
  season?: string;
  inputSetId?: string;
};

type RunWithScenarioData = {
  id: string;
  inputSetId: string;
  status: string;
  outcome: string | null;
  objectiveValue: number | null;
  objectiveBreakdown: string | null;
  solverStatus: string | null;
  settings: string;
  createdAt: Date;
  finishedAt: Date | null;
  inputSet: {
    district: string;
    season: string;
  };
  snapshot: {
    id: string;
    stale: boolean;
    totalExcess: number;
    maxExcess: number;
    affectedClubs: number;
    objectiveBreakdown: string;
  } | null;
};

export async function listScenarios(filters: ScenarioFilters = {}) {
  const runs = await prisma.rasterOptimizationRun.findMany({
    where: {
      ...(filters.inputSetId ? { inputSetId: filters.inputSetId } : {}),
      inputSet: {
        ...(filters.district ? { district: filters.district } : {}),
        ...(filters.season ? { season: filters.season } : {}),
      },
    },
    include: {
      inputSet: { select: { district: true, season: true } },
      snapshot: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return runs.map((run) => scenarioFromRun(run));
}

export async function getScenario(id: string) {
  const run = await prisma.rasterOptimizationRun.findUnique({
    where: { id },
    include: {
      inputSet: { select: { district: true, season: true } },
      snapshot: true,
    },
  });
  return run ? scenarioFromRun(run) : null;
}

export async function getScenariosByIds(ids: string[]) {
  if (!ids.length) return [];
  const runs = await prisma.rasterOptimizationRun.findMany({
    where: { id: { in: ids } },
    include: {
      inputSet: { select: { district: true, season: true } },
      snapshot: true,
    },
  });
  const byId = new Map(runs.map((run) => [run.id, scenarioFromRun(run)]));
  return ids.flatMap((id) => {
    const scenario = byId.get(id);
    return scenario ? [scenario] : [];
  });
}

export function scenarioFromRun(run: RunWithScenarioData): RasterScenario {
  const settings = parseSettings(run.settings);
  return {
    id: run.id,
    inputSetId: run.inputSetId,
    district: run.inputSet.district,
    season: run.inputSet.season,
    name:
      stringSetting(settings.name) ??
      strategyLabel(strategyFromSettings(settings)),
    origin:
      strategyFromSettings(settings) === "manual" ? "manual" : "optimizer",
    strategy: strategyFromSettings(settings),
    status: statusFromRun(run),
    settings,
    kpiSummary: run.snapshot
      ? kpiSummaryFromSnapshot({
          ...run.snapshot,
          objectiveBreakdown:
            run.snapshot.objectiveBreakdown || run.objectiveBreakdown || "{}",
          run,
        })
      : null,
    detailRef: run.snapshot ? `/raster/snapshots/${run.snapshot.id}` : null,
    stale: run.snapshot?.stale ?? false,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

function parseSettings(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringSetting(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strategyFromSettings(
  settings: Record<string, unknown>,
): ScenarioStrategy {
  if (settings.strategy === "manual") return "manual";
  return settings.strategy === "initial_heuristic"
    ? "initial_heuristic"
    : "cp_sat";
}

function strategyLabel(strategy: ScenarioStrategy) {
  if (strategy === "manual") return "Manual";
  return strategy === "initial_heuristic" ? "Initial heuristic" : "CP-SAT";
}

function statusFromRun(run: RunWithScenarioData): ScenarioStatus {
  if (run.status === "PENDING") return "queued";
  if (run.status === "RUNNING") return "running";
  if (run.status === "CANCELLED" || run.outcome === "CANCELLED") {
    return "cancelled";
  }
  if (run.status === "FAILED" || run.outcome === "FAILED") return "failed";
  if (run.outcome === "INFEASIBLE") return "no_solution";
  if (run.outcome === "FEASIBLE") return "feasible";
  if (run.outcome === "PROVEN_OPTIMAL") return "completed";
  return run.snapshot ? "completed" : "failed";
}
