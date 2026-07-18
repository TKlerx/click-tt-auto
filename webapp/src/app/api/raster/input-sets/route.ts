import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { createInputSet, listInputSets } from "@/services/raster";
import { z } from "zod";

const createInputSetBodySchema = z.object({
  scope: z.string().trim().min(1).optional(),
  district: z.string().trim().min(1).optional(),
  season: z.string().trim().optional(),
  name: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const searchParams = new URL(request.url).searchParams;
  const scopeCode =
    searchParams.get("scope")?.trim() ?? searchParams.get("district")?.trim();
  const season = normalizeRasterSeason(searchParams.get("season"));
  if (!scopeCode) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "viewer");
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  return NextResponse.json({
    inputSets: await listInputSets(scope.id, season),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const parsed = createInputSetBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input set payload" },
      { status: 400 },
    );
  }

  const scopeCode = parsed.data.scope ?? parsed.data.district;
  if (!scopeCode) {
    return NextResponse.json(
      { error: "Invalid input set payload" },
      { status: 400 },
    );
  }

  const access = await assertRasterAccess(auth.user, scopeCode, "scheduler");
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(scopeCode);
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const inputSet = await createInputSet({
    scopeId: scope.id,
    name: parsed.data.name,
    season: normalizeRasterSeason(parsed.data.season),
    createdById: auth.user.id,
  });

  return NextResponse.json({ inputSet }, { status: 201 });
}
