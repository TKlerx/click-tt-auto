import type { User } from "../../generated/prisma/client";
import { Role } from "../../generated/prisma/enums";
import { prisma } from "@/lib/db";

export const SCOPED_ROLES = [Role.SCOPE_ADMIN, Role.SCOPE_USER] as const;

export function checkRole(
  user: Pick<User, "role"> | null,
  allowedRoles: Role[],
): boolean {
  return !!user && allowedRoles.includes(user.role);
}

export function isAdmin(role: Role) {
  return role === Role.PLATFORM_ADMIN;
}

export async function getUserScopeIds(userId: string) {
  const assignments = await prisma.userScopeAssignment.findMany({
    where: { userId },
    select: { scopeId: true },
  });

  return assignments.map((assignment) => assignment.scopeId);
}

export async function checkScopeAccess(
  user: Pick<User, "id" | "role"> | null,
  scopeId: string,
): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (isAdmin(user.role)) {
    return true;
  }

  const scopeIds = await getUserScopeIds(user.id);
  return scopeIds.includes(scopeId);
}
