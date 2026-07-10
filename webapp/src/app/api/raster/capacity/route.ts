import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { searchHallCapacities } from "@/services/raster";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const search = new URL(request.url).searchParams;
  const district = search.get("district")?.trim();
  if (!district) {
    return NextResponse.json(
      { error: "district is required" },
      { status: 400 },
    );
  }

  const access = await assertRasterAccess(auth.user, district, "viewer");
  if (access !== true) return access.error;

  return NextResponse.json({
    capacities: await searchHallCapacities(district, search.get("q")),
  });
}
