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

async function actorSharesScopeWithTarget(actorId: string, targetId: string) {
  const actorScopeIds = await getUserScopeIds(actorId);
  if (actorScopeIds.length === 0) {
    return false;
  }
  const shared = await prisma.userScopeAssignment.findFirst({
    where: { userId: targetId, scopeId: { in: actorScopeIds } },
    select: { scopeId: true },
  });
  return !!shared;
}

/**
 * Whether `actor` may set `target`'s role to `nextRole`.
 *
 * `canAssignRole` alone guards only the destination rank, which lets a scope
 * admin demote a user ranked above them (a platform admin) or reroll a user in
 * a scope they do not hold. The spec confines a scope admin to acting within
 * their own scopes (User Story 2 scenario 5; edge case "acts on a user who
 * holds scopes outside the admin's own"), so a scope admin may change a role
 * only for a target at or below their own rank and sharing at least one scope,
 * and never their own.
 */
export async function mayManageUserRole(
  actor: Pick<User, "id" | "role">,
  target: Pick<User, "id" | "role">,
  nextRole: Role,
  sharesScope: (
    actorId: string,
    targetId: string,
  ) => Promise<boolean> = actorSharesScopeWithTarget,
) {
  if (!canAssignRole(actor, nextRole)) {
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

  return sharesScope(actor.id, target.id);
}
