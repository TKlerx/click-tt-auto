import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { getRasterRoster } from "@/services/raster";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const scopeCode = url.searchParams.get("scope")?.trim() ?? "";
  const season = normalizeRasterSeason(url.searchParams.get("season") ?? "");
  if (!scopeCode) {
    return NextResponse.json({ error: "Missing scope" }, { status: 422 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;

  const scope = await resolveRasterScope(scopeCode);
  if (!scope)
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });

  return NextResponse.json({ roster: await getRasterRoster(scope.id, season) });
}
