import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { listSnapshots } from "@/services/raster";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const scopeCode = new URL(request.url).searchParams.get("scope")?.trim();
  if (!scopeCode) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  return NextResponse.json({ snapshots: await listSnapshots(scope.id) });
}
