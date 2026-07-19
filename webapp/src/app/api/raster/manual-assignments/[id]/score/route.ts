import { NextResponse } from "next/server";
import { assertRasterAccess } from "@/lib/raster/access";
import { requireApiUser } from "@/lib/route-auth";
import {
  getManualAssignmentDraft,
  scoreManualAssignmentDraft,
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

  try {
    const result = await scoreManualAssignmentDraft(draft.id, auth.user.id);
    if (result.issues.length) {
      return NextResponse.json(
        {
          error: "Manual assignment has validation issues",
          issues: result.issues,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ run: result.run }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scoring failed" },
      { status: 422 },
    );
  }
}
