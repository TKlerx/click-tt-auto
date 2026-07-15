import type { SessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { Role } from "../../../generated/prisma/enums";
import type { RouteErrorResult } from "@/services/api/types";
import { isSelectableRasterScope } from "./scope-level";

export type RasterAccessLevel = "viewer" | "scheduler" | "admin";
export type RasterScopeOption = {
  id: string;
  code: string;
  name: string;
  parent: {
    code: string;
    name: string;
    parent: { code: string; name: string } | null;
  } | null;
};

const levelRoles: Record<RasterAccessLevel, Role[]> = {
  viewer: [Role.PLATFORM_ADMIN, Role.SCOPE_ADMIN, Role.SCOPE_USER],
  scheduler: [Role.PLATFORM_ADMIN, Role.SCOPE_ADMIN],
  admin: [Role.PLATFORM_ADMIN],
};

export function rasterScopeWhere(scopeId: string) {
  return { scopeId };
}

export function canUseRasterLevel(
  user: Pick<SessionUser, "role">,
  level: RasterAccessLevel,
) {
  return levelRoles[level].includes(user.role);
}

export async function listAccessibleRasterScopes(
  user: Pick<SessionUser, "id" | "role">,
): Promise<RasterScopeOption[]> {
  const scopes = await prisma.scope.findMany({
    where:
      user.role === Role.PLATFORM_ADMIN
        ? undefined
        : {
            OR: [
              { userAssignments: { some: { userId: user.id } } },
              { parent: { userAssignments: { some: { userId: user.id } } } },
              {
                parent: {
                  parent: { userAssignments: { some: { userId: user.id } } },
                },
              },
            ],
          },
    select: {
      code: true,
      id: true,
      name: true,
      parent: {
        select: {
          code: true,
          name: true,
          parent: { select: { code: true, name: true } },
        },
      },
    },
  });

  return [...scopes]
    .filter(isSelectableRasterScope)
    .sort((left, right) =>
      rasterScopePath(left).localeCompare(rasterScopePath(right), "de"),
    );
}

export function rasterScopePath(scope: RasterScopeOption) {
  return [scope.parent?.parent, scope.parent, scope]
    .filter((item): item is { code: string; name: string } => Boolean(item))
    .map((item) => item.name)
    .join(" / ");
}

export async function canAccessRasterScope(
  user: Pick<SessionUser, "id" | "role">,
  scopeCode: string,
) {
  if (user.role === Role.PLATFORM_ADMIN) {
    return true;
  }

  const scope = await prisma.scope.findFirst({
    where: {
      AND: [
        { code: scopeCode },
        {
          OR: [
            { userAssignments: { some: { userId: user.id } } },
            { parent: { userAssignments: { some: { userId: user.id } } } },
            {
              parent: {
                parent: { userAssignments: { some: { userId: user.id } } },
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
  });

  return !!scope;
}

export async function resolveRasterScope(code: string) {
  return prisma.scope.findFirst({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      parent: {
        select: {
          code: true,
          name: true,
          parent: { select: { code: true, name: true } },
        },
      },
    },
  });
}

export async function assertRasterAccess(
  user: Pick<SessionUser, "id" | "role">,
  scopeCode: string,
  level: RasterAccessLevel = "viewer",
): Promise<true | RouteErrorResult> {
  if (!canUseRasterLevel(user, level)) {
    return { error: jsonError("Not authorized", 403) };
  }

  if (!(await canAccessRasterScope(user, scopeCode))) {
    return { error: jsonError("Not authorized for this scope", 403) };
  }

  return true;
}
