import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess, resolveRasterScope } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { createInputSet, listInputSets } from "@/services/raster";
import { z } from "zod";

const createInputSetBodySchema = z.object({
  scope: z.string().trim().min(1),
  season: z.string().trim().optional(),
  name: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const scopeCode = new URL(request.url).searchParams.get("scope")?.trim();
  const season = normalizeRasterSeason(
    new URL(request.url).searchParams.get("season"),
  );
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

  const access = await assertRasterAccess(
    auth.user,
    parsed.data.scope,
    "admin",
  );
  if (access !== true) return access.error;
  const scope = await resolveRasterScope(parsed.data.scope);
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
