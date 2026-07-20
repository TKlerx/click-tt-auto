import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { prisma } from "@/lib/db";
import {
  listRasterSourcesForInputSet,
  listRasterSourcesForScope,
  upsertRasterSource,
} from "@/services/raster";

const sourceBodySchema = z.object({
  scopeCode: z.string().trim().min(1),
  season: z.string().trim().optional(),
  inputSetId: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  sourceRef: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  contentHash: z.string().trim().optional(),
  parsedJson: z.string().trim().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const scopeCode = search.get("scope")?.trim();
  const season = normalizeRasterSeason(search.get("season"));
  const inputSetId = search.get("workspace")?.trim();
  if (!scopeCode) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  if (inputSetId) {
    const inputSet = await prisma.rasterInputSet.findFirst({
      where: { id: inputSetId, scopeId: scope.id, season },
      select: { id: true },
    });
    if (!inputSet) {
      return NextResponse.json(
        { error: "Planning workspace not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      sources: await listRasterSourcesForInputSet(
        inputSet.id,
        search.get("sourceType")?.trim() || undefined,
      ),
    });
  }

  return NextResponse.json({
    sources: await listRasterSourcesForScope(
      scope.id,
      season,
      search.get("sourceType")?.trim() || undefined,
    ),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = sourceBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid source payload" },
      { status: 422 },
    );
  }

  const access = await assertRasterAccess(
    auth.user,
    parsed.data.scopeCode,
    "scheduler",
  );
  if (access !== true) return access.error;

  const scope = await resolveRasterScope(parsed.data.scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const inputSet = await prisma.rasterInputSet.findFirst({
    where: {
      id: parsed.data.inputSetId,
      scopeId: scope.id,
      season: normalizeRasterSeason(parsed.data.season),
    },
    select: { id: true },
  });
  if (!inputSet) {
    return NextResponse.json(
      { error: "Planning workspace not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      source: await upsertRasterSource({
        scopeId: scope.id,
        inputSetId: inputSet.id,
        season: normalizeRasterSeason(parsed.data.season),
        sourceType: parsed.data.sourceType,
        sourceRef: parsed.data.sourceRef,
        displayName: parsed.data.displayName,
        contentHash: parsed.data.contentHash,
        parsedJson: parsed.data.parsedJson,
      }),
    },
    { status: 201 },
  );
}
