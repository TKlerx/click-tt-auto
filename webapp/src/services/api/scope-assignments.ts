import { safeLogAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { mayManageScopeAssignment } from "@/lib/rbac";
import { isSelectableRasterScope } from "@/lib/raster/scope-level";
import { requireRouteUserWithRoles } from "@/services/api/route-context";
import { withSerializableRetry } from "@/services/api/serializable-retry";
import type { RouteParamsWithId } from "@/services/api/types";
import { Prisma } from "../../../generated/prisma/client";
import { AuditAction, Role } from "../../../generated/prisma/enums";

type ScopeBody = { scopeId?: string };
type ManagedScope = Prisma.ScopeGetPayload<{ select: typeof scopeSelect }>;

export async function listManagedUserScopes(
  params: RouteParamsWithId,
  request?: Request,
) {
  const managed = await requireScopeAssignmentContext(
    params,
    undefined,
    request,
  );
  if ("error" in managed) {
    return managed;
  }

  const assignments = await prisma.userScopeAssignment.findMany({
    where:
      managed.actor.role === Role.PLATFORM_ADMIN
        ? { userId: managed.target.id }
        : {
            userId: managed.target.id,
            scope: { userAssignments: { some: { userId: managed.actor.id } } },
          },
    select: { scope: { select: scopeSelect } },
    orderBy: { scope: { name: "asc" } },
  });

  return { scopes: assignments.map((assignment) => assignment.scope) };
}

export async function grantManagedUserScope(
  params: RouteParamsWithId,
  body: ScopeBody,
  request?: Request,
) {
  const managed = await requireScopeActionContext(
    params,
    body.scopeId,
    request,
  );
  if ("error" in managed) {
    return managed;
  }

  const assignment = await withSerializableRetry(() =>
    prisma.userScopeAssignment.upsert({
      where: {
        userId_scopeId: {
          userId: managed.target.id,
          scopeId: managed.scope.id,
        },
      },
      create: {
        userId: managed.target.id,
        scopeId: managed.scope.id,
      },
      update: {},
    }),
  );

  await safeLogAudit({
    action: AuditAction.SCOPE_ASSIGNMENT_CHANGED,
    entityType: "UserScopeAssignment",
    entityId: assignment.id,
    actorId: managed.actor.id,
    scopeId: managed.scope.id,
    details: {
      direction: "grant",
      userId: managed.target.id,
      scopeId: managed.scope.id,
    },
  });

  return { scope: managed.scope };
}

export async function revokeManagedUserScope(
  params: RouteParamsWithId,
  body: ScopeBody,
  request?: Request,
) {
  const managed = await requireScopeActionContext(
    params,
    body.scopeId,
    request,
  );
  if ("error" in managed) {
    return managed;
  }

  const deleted = await withSerializableRetry(() =>
    prisma.userScopeAssignment.deleteMany({
      where: { userId: managed.target.id, scopeId: managed.scope.id },
    }),
  );

  if (deleted.count > 0) {
    await safeLogAudit({
      action: AuditAction.SCOPE_ASSIGNMENT_CHANGED,
      entityType: "UserScopeAssignment",
      entityId: `${managed.target.id}:${managed.scope.id}`,
      actorId: managed.actor.id,
      scopeId: managed.scope.id,
      details: {
        direction: "revoke",
        userId: managed.target.id,
        scopeId: managed.scope.id,
      },
    });
  }

  return { scope: managed.scope };
}

async function requireScopeAssignmentContext(
  params: RouteParamsWithId,
  scopeId?: string,
  request?: Request,
) {
  const auth = await requireRouteUserWithRoles(
    [Role.PLATFORM_ADMIN, Role.SCOPE_ADMIN],
    request,
  );
  if ("error" in auth) {
    return auth;
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { error: jsonError("User not found", 404) };
  }

  if (!scopeId) {
    return { actor: auth.user, target };
  }

  const scope = await prisma.scope.findUnique({
    where: { id: scopeId },
    select: scopeSelect,
  });
  if (!scope || !isSelectableRasterScope(scope)) {
    return { error: jsonError("Scope is not assignable", 400) };
  }

  if (!(await mayManageScopeAssignment(auth.user, target, scope.id))) {
    return { error: jsonError("Not authorized for this scope", 403) };
  }

  return { actor: auth.user, target, scope };
}

async function requireScopeActionContext(
  params: RouteParamsWithId,
  scopeId?: string,
  request?: Request,
) {
  const managed = await requireScopeAssignmentContext(params, scopeId, request);
  if ("error" in managed) {
    return managed;
  }

  if (!("scope" in managed)) {
    return { error: jsonError("Scope ID is required", 400) };
  }

  return managed as typeof managed & { scope: ManagedScope };
}

const scopeSelect = {
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
} satisfies Prisma.ScopeSelect;
