import { NextResponse } from "next/server";
import { runSettingsSchema, type RunSettingsInput } from "@/lib/raster/schemas";
import { startOptimizationRun } from "@/services/raster";

type StartedRun = Awaited<ReturnType<typeof startOptimizationRun>>;

export async function startRasterRunResponse(
  request: Request,
  params: {
    inputSetId: string;
    startedById: string;
    onStarted?: (result: {
      run: StartedRun;
      settings: RunSettingsInput;
    }) => Promise<void>;
  },
) {
  const parsed = runSettingsSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid run settings", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const run = await startOptimizationRun({
    inputSetId: params.inputSetId,
    startedById: params.startedById,
    settings: parsed.data,
  });
  await params.onStarted?.({ run, settings: parsed.data });

  return NextResponse.json({ run }, { status: 202 });
}
