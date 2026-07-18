import { NextResponse } from "next/server";
import { assertRasterAccess } from "@/lib/raster/access";
import { requireApiUser } from "@/lib/route-auth";
import {
  getManualAssignmentDraft,
  validateManualAssignmentDraft,
} from "@/services/raster";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const draft = await getManualAssignmentDraft((await params).id);
  if (!draft) {
    return NextResponse.json(
      { error: "Manual assignment not found" },
      { status: 404 },
    );
  }
  const access = await assertRasterAccess(
    auth.user,
    draft.inputSet.scope.code,
    "scheduler",
  );
  if (access !== true) return access.error;

  const validation = await validateManualAssignmentDraft(draft.id);
  return NextResponse.json(validation);
}
