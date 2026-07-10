import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import {
  assertRasterAccess,
  type RasterAccessLevel,
} from "@/lib/raster/access";
import { getInputSet, getSnapshot } from "@/services/raster";

export async function requireRasterInputSet(
  request: Request,
  id: string,
  level: RasterAccessLevel,
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth;

  const inputSet = await getInputSet(id);
  if (!inputSet) {
    return {
      error: NextResponse.json(
        { error: "Input set not found" },
        { status: 404 },
      ),
    };
  }

  const access = await assertRasterAccess(auth.user, inputSet.district, level);
  if (access !== true) return access;

  return { user: auth.user, inputSet };
}

export async function requireRasterSnapshot(
  request: Request,
  id: string,
  level: RasterAccessLevel,
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth;

  const snapshot = await getSnapshot(id);
  if (!snapshot) {
    return {
      error: NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 },
      ),
    };
  }

  const access = await assertRasterAccess(auth.user, snapshot.district, level);
  if (access !== true) return access;

  return { user: auth.user, snapshot };
}
