import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { createInputSet, listInputSets } from "@/services/raster";
import { z } from "zod";

const createInputSetBodySchema = z.object({
  district: z.string().trim().min(1),
  season: z.string().trim().optional(),
  name: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const district = new URL(request.url).searchParams.get("district")?.trim();
  const season = normalizeRasterSeason(
    new URL(request.url).searchParams.get("season"),
  );
  if (!district) {
    return NextResponse.json(
      { error: "district is required" },
      { status: 400 },
    );
  }

  const access = await assertRasterAccess(auth.user, district, "viewer");
  if (access !== true) return access.error;

  return NextResponse.json({
    inputSets: await listInputSets(district, season),
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
    parsed.data.district,
    "admin",
  );
  if (access !== true) return access.error;

  const inputSet = await createInputSet({
    ...parsed.data,
    season: normalizeRasterSeason(parsed.data.season),
    createdById: auth.user.id,
  });

  return NextResponse.json({ inputSet }, { status: 201 });
}
