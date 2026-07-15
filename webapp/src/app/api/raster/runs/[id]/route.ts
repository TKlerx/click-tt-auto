import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import {
  archiveOptimizationRun,
  cancelOptimizationRun,
  getOptimizationRun,
} from "@/services/raster";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const run = await getOptimizationRun((await params).id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const access = await assertRasterAccess(
    auth.user,
    run.inputSet.scope.code,
    "viewer",
  );
  if (access !== true) return access.error;

  return NextResponse.json({ run });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const run = await getOptimizationRun((await params).id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const access = await assertRasterAccess(
    auth.user,
    run.inputSet.scope.code,
    "admin",
  );
  if (access !== true) return access.error;

  if (run.status === "PENDING" || run.status === "RUNNING") {
    return NextResponse.json({ run: await cancelOptimizationRun(run.id) });
  }

  return NextResponse.json({ run: await archiveOptimizationRun(run.id) });
}
