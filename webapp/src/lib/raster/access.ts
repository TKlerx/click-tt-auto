import type { SessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { Role } from "../../../generated/prisma/enums";
import type { RouteErrorResult } from "@/services/api/types";

export type RasterAccessLevel = "viewer" | "scheduler" | "admin";

const levelRoles: Record<RasterAccessLevel, Role[]> = {
  viewer: [Role.PLATFORM_ADMIN, Role.SCOPE_ADMIN, Role.SCOPE_USER],
  scheduler: [Role.PLATFORM_ADMIN, Role.SCOPE_ADMIN],
  admin: [Role.PLATFORM_ADMIN],
};

export function rasterDistrictWhere(district: string) {
  return { district };
}

export function canUseRasterLevel(
  user: Pick<SessionUser, "role">,
  level: RasterAccessLevel,
) {
  return levelRoles[level].includes(user.role);
}

export async function canAccessRasterDistrict(
  user: Pick<SessionUser, "id" | "role">,
  district: string,
) {
  if (user.role === Role.PLATFORM_ADMIN) {
    return true;
  }

  const scope = await prisma.scope.findFirst({
    where: {
      OR: [{ code: district }, { name: district }],
      userAssignments: { some: { userId: user.id } },
    },
    select: { id: true },
  });

  return !!scope;
}

export async function assertRasterAccess(
  user: Pick<SessionUser, "id" | "role">,
  district: string,
  level: RasterAccessLevel = "viewer",
): Promise<true | RouteErrorResult> {
  if (!canUseRasterLevel(user, level)) {
    return { error: jsonError("Not authorized", 403) };
  }

  if (!(await canAccessRasterDistrict(user, district))) {
    return { error: jsonError("Not authorized for this district", 403) };
  }

  return true;
}
