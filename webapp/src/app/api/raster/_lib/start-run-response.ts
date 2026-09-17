import { NextResponse } from "next/server";
import { runRequestSchema, type RunSettingsInput } from "@/lib/raster/schemas";
import {
  BaselineValidationError,
  startOptimizationRun,
} from "@/services/raster";

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
  const parsed = runRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid run settings", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { baselineId, ...settings } = parsed.data;
  let run: StartedRun;
  try {
    run = await startOptimizationRun({
      inputSetId: params.inputSetId,
      startedById: params.startedById,
      settings,
      baselineId,
    });
  } catch (error) {
    if (error instanceof BaselineValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
  await params.onStarted?.({ run, settings });

  return NextResponse.json({ run }, { status: 202 });
}
