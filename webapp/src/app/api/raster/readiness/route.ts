import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { listMatchReviewState } from "@/lib/raster/match-review";
import { deriveRasterReadiness } from "@/lib/raster/readiness";
import { normalizeRasterSeason } from "@/lib/raster/season";
import {
  listInputSets,
  listRasterSourcesForScope,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const scopeCode = search.get("scope")?.trim();
  if (!scopeCode) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }
  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;

  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Unknown scope" }, { status: 404 });
  }
  const season = normalizeRasterSeason(search.get("season"));
  const [inputSets, sources] = await Promise.all([
    listInputSets(scope.id, season),
    listRasterSourcesForScope(scope.id, season),
  ]);
  const inputSet = inputSets[0] ?? null;
  const [capacityReview, matchReview] = inputSet
    ? await Promise.all([
        reviewHallCapacitiesForInputSet(inputSet.id),
        listMatchReviewState(inputSet.id),
      ])
    : [null, []];

  return NextResponse.json({
    readiness: deriveRasterReadiness({
      sourceCount: sources.length,
      inputSet,
      capacityReview,
      matchReviewOutstandingCount: matchReview.filter(
        (record) => record.status === "outstanding",
      ).length,
    }),
  });
}
