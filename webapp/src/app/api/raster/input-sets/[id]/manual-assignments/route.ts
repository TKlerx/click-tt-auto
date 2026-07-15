import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";
import {
  createManualAssignmentDraft,
  rowsFromManualAssignmentInput,
} from "@/services/raster";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "admin",
  );
  if ("error" in context) return context.error;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    paste?: unknown;
    rows?: unknown;
  };
  const draft = await createManualAssignmentDraft({
    inputSetId: context.inputSet.id,
    createdById: context.user.id,
    name: String(body.name ?? ""),
    rows: rowsFromManualAssignmentInput(body),
  });

  return NextResponse.json({ draft }, { status: 201 });
}
