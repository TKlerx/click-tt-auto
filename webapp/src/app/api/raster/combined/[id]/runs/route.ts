import { NextResponse } from "next/server";
import { startRasterRunResponse } from "@/app/api/raster/_lib/start-run-response";
import { logRasterAudit } from "@/lib/raster/audit";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { prisma } from "@/lib/db";
import { AuditAction } from "../../../../../../../generated/prisma/enums";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: (await params).id },
    select: {
      id: true,
      spannedScopes: { select: { scope: { select: { code: true } } } },
    },
  });
  if (!inputSet || inputSet.spannedScopes.length < 2) {
    return NextResponse.json(
      { error: "Combined input set not found" },
      { status: 404 },
    );
  }

  // Every spanned scope is checked, not just an owning one: a combined run
  // plans them all, so access to one must not carry access to the rest.
  for (const { scope } of inputSet.spannedScopes) {
    const access = await assertRasterAccess(auth.user, scope.code, "admin");
    if (access !== true) return access.error;
  }

  return startRasterRunResponse(request, {
    inputSetId: inputSet.id,
    startedById: auth.user.id,
    onStarted: async ({ run, settings }) => {
      await logRasterAudit({
        action: AuditAction.RASTER_RUN_STARTED,
        actorId: auth.user.id,
        scope: inputSet.spannedScopes
          .map(({ scope }) => scope.code)
          .sort()
          .join(","),
        entityType: "RasterOptimizationRun",
        entityId: run.id,
        details: { inputSetId: inputSet.id, settings, combined: true },
      });
    },
  });
}
