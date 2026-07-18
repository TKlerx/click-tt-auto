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

const roleRank: Record<Role, number> = {
  [Role.SCOPE_USER]: 0,
  [Role.SCOPE_ADMIN]: 1,
  [Role.PLATFORM_ADMIN]: 2,
};

export function canAssignRole(actor: Pick<User, "role">, targetRole: Role) {
  return roleRank[targetRole] <= roleRank[actor.role];
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

export async function mayManageScopeAssignment(
  actor: Pick<User, "id" | "role">,
  target: Pick<User, "id" | "role">,
  scopeId: string,
  getActorScopeIds: (userId: string) => Promise<string[]> = getUserScopeIds,
  isAssignableScope: (scopeId: string) => Promise<boolean> = async () => true,
) {
  if (!(await isAssignableScope(scopeId))) {
    return false;
  }

  if (actor.role === Role.PLATFORM_ADMIN) {
    return true;
  }

  if (actor.role !== Role.SCOPE_ADMIN || actor.id === target.id) {
    return false;
  }

  if (!canAssignRole(actor, target.role)) {
    return false;
  }

  return (await getActorScopeIds(actor.id)).includes(scopeId);
}
