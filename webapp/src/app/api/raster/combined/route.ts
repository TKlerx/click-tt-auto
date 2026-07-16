import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/route-auth";
import { canUseRasterLevel } from "@/lib/raster/access";
import { normalizeRasterSeason } from "@/lib/raster/season";
import { createCombinedInputSet } from "@/services/raster";

const createCombinedBodySchema = z.object({
  scopeIds: z.array(z.string().trim().min(1)).min(2),
  ownerScopeId: z.string().trim().min(1).optional(),
  season: z.string().trim().optional(),
  name: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;
  if (!canUseRasterLevel(auth.user, "admin")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const parsed = createCombinedBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid combined input set payload" },
      { status: 400 },
    );
  }

  try {
    const inputSet = await createCombinedInputSet({
      user: auth.user,
      scopeIds: parsed.data.scopeIds,
      ownerScopeId: parsed.data.ownerScopeId ?? parsed.data.scopeIds[0]!,
      season: normalizeRasterSeason(parsed.data.season),
      name: parsed.data.name,
    });
    return NextResponse.json({ inputSet }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create" },
      { status: 400 },
    );
  }
}
