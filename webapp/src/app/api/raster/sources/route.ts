import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { prisma } from "@/lib/db";
import { listRasterSourcesForDistrict, upsertRasterSource } from "@/services/raster";

const sourceBodySchema = z.object({
  scopeCode: z.string().trim().min(1),
  season: z.string().trim().optional(),
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
  const district = search.get("district")?.trim();
  const season = normalizeRasterSeason(search.get("season"));
  if (!district) {
    return NextResponse.json(
      { error: "district is required" },
      { status: 400 },
    );
  }

  const access = await assertRasterAccess(auth.user, district, "viewer");
  if (access !== true) return access.error;

  return NextResponse.json({
    sources: await listRasterSourcesForDistrict(
      district,
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
    return NextResponse.json({ error: "Invalid source payload" }, { status: 422 });
  }

  const access = await assertRasterAccess(auth.user, parsed.data.scopeCode, "admin");
  if (access !== true) return access.error;

  const scope = await prisma.scope.findFirst({
    where: {
      OR: [{ code: parsed.data.scopeCode }, { name: parsed.data.scopeCode }],
    },
    select: { id: true },
  });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      source: await upsertRasterSource({
        scopeId: scope.id,
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
