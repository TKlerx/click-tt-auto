import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { compareScenarios } from "@/services/raster/scenarioComparison";
import { getScenariosByIds } from "@/services/raster/scenarios";

const compareBodySchema = z.object({
  scenarioIds: z.array(z.string().trim().min(1)).min(2),
  baselineScenarioId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = compareBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid comparison payload" },
      { status: 422 },
    );
  }

  const scenarios = await getScenariosByIds([
    ...new Set(parsed.data.scenarioIds),
  ]);

  // Authorize every scenario's scope before comparing, rather than checking
  // the first one afterwards. Comparable scenarios do share a scope today,
  // so one check happened to cover them all -- but that is isComparableScenario
  // enforcing a compatibility rule, not an access rule. Relaxing compatibility
  // later (say, to compare across seasons) would silently widen access with no
  // test failing. Checking each scope keeps this correct on its own terms.
  for (const scope of new Set(scenarios.map((scenario) => scenario.scope))) {
    const access = await assertRasterAccess(auth.user, scope, "viewer");
    if (access !== true) return access.error;
  }

  let comparison;
  try {
    comparison = compareScenarios(scenarios, parsed.data.baselineScenarioId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid comparison" },
      { status: 422 },
    );
  }

  return NextResponse.json(comparison);
}
