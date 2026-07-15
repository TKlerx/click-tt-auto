import { NextResponse } from "next/server";
import { assertRasterAccess } from "@/lib/raster/access";
import { requireApiUser } from "@/lib/route-auth";
import { getScenarioDetails } from "@/services/raster";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const details = await getScenarioDetails((await params).id);
  if (!details) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }
  const access = await assertRasterAccess(
    auth.user,
    details.scenario.scope,
    "viewer",
  );
  if (access !== true) return access.error;

  return NextResponse.json(details);
}
