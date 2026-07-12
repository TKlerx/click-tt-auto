import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { compareScenarioIds } from "@/services/raster/scenarioComparison";

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

  let comparison;
  try {
    comparison = await compareScenarioIds(
      parsed.data.scenarioIds,
      parsed.data.baselineScenarioId,
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid comparison" },
      { status: 422 },
    );
  }

  const access = await assertRasterAccess(
    auth.user,
    comparison.scenarios[0]!.district,
    "viewer",
  );
  if (access !== true) return access.error;

  return NextResponse.json(comparison);
}
