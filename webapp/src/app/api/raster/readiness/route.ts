import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import {
  buildReadinessAcrossScopes,
  buildReadinessForScope,
} from "@/lib/raster/readiness-across-scopes";
import { normalizeRasterSeason } from "@/lib/raster/season";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const scopeCode = search.get("scope")?.trim();
  const season = normalizeRasterSeason(search.get("season"));
  if (!scopeCode) {
    return NextResponse.json({
      scopes: await buildReadinessAcrossScopes(auth.user, season),
    });
  }
  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;

  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Unknown scope" }, { status: 404 });
  }

  return NextResponse.json({
    readiness: await buildReadinessForScope(scope.id, season),
  });
}
