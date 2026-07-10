import {
  getPasswordComplexityErrorMessage,
  hashPassword,
  validatePasswordComplexity,
} from "@/lib/auth";
import { safeLogAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import {
  requireRouteUser,
  requireRouteUserWithRoles,
} from "@/services/api/route-context";
import {
  safeQueueRoleChangedNotifications,
  safeQueueUserCreatedNotifications,
  safeQueueUserStatusChangedNotifications,
} from "@/services/notifications/service";
import type {
  ManagedUserResult,
  ManagedUserStatusUpdateOptions,
  RouteParamsWithId,
} from "@/services/api/types";
import {
  AuditAction,
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../../generated/prisma/enums";
import type { User } from "../../../generated/prisma/client";
import { Prisma } from "../../../generated/prisma/client";

const SERIALIZABLE_RETRY_LIMIT = 3;

export function parseUserStatusFilter(value: string | null) {
  if (!value) {
    return { status: null };
  }

  if (!Object.values(UserStatus).includes(value as UserStatus)) {
    return {
      error: jsonError(
        "Invalid status filter. Supported values: PENDING_APPROVAL, ACTIVE, INACTIVE",
        400,
      ),
    };
  }

  return { status: value as UserStatus };
}

export async function listUsers(status: UserStatus | null) {
  const users = await prisma.user.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    authMethod: user.authMethod,
    createdAt: user.createdAt,
  }));
}

export async function createLocalUser(
  actorId: string,
  body: {
    email?: string;
    name?: string;
    role?: Role;
    temporaryPassword?: string;
  },
) {
  if (!body.email || !body.name || !body.role || !body.temporaryPassword) {
    return {
      error: jsonError(
        "Email, name, role, and temporary password are required",
        400,
      ),
    };
  }

  if (!Object.values(Role).includes(body.role)) {
    return { error: jsonError("Invalid role", 400) };
  }

  if (!validatePasswordComplexity(body.temporaryPassword)) {
    return { error: jsonError(getPasswordComplexityErrorMessage(), 400) };
  }

  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: jsonError("A user with this email already exists", 409) };
  }

  const passwordHash = await hashPassword(body.temporaryPassword);
  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      emailVerified: true,
      role: body.role,
      status: UserStatus.ACTIVE,
      authMethod: AuthMethod.LOCAL,
      mustChangePassword: true,
      themePreference: ThemePreference.LIGHT,
      accounts: {
        create: {
          providerId: "credential",
          accountId: email,
          password: passwordHash,
        },
      },
    },
  });

  await safeLogAudit({
    action: AuditAction.USER_CREATED,
    entityType: "User",
    entityId: user.id,
    actorId,
    details: {
      role: body.role,
      authMethod: "LOCAL",
    },
  });

  await safeQueueUserCreatedNotifications({
    actorId,
    user,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      authMethod: user.authMethod,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function updateOwnThemePreference(
  actorId: string,
  body: { themePreference?: ThemePreference },
) {
  if (!body.themePreference) {
    return { error: jsonError("Theme preference is required", 400) };
  }

  if (!Object.values(ThemePreference).includes(body.themePreference)) {
    return { error: jsonError("Invalid theme preference", 400) };
  }

  const updated = await prisma.user.update({
    where: { id: actorId },
    data: { themePreference: body.themePreference },
  });

  return { themePreference: updated.themePreference };
}

export async function requireManagedUserContext(
  params: RouteParamsWithId,
  request?: Request,
): Promise<ManagedUserResult> {
  const auth = await requireRouteUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth;
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return { error: jsonError("User not found", 404) };
  }

  return { user, actor: auth.user };
}

export async function ensureAdminUserCanChange(
  user: Pick<User, "role" | "status">,
  nextState: {
    role?: Role;
    status?: UserStatus;
    message: string;
  },
  countUsers: (args: {
    where: { role: Role; status: UserStatus | { not: UserStatus } };
  }) => Promise<number> = prisma.user.count,
) {
  if (user.role !== Role.PLATFORM_ADMIN) {
    return null;
  }

  const effectiveRole = nextState.role ?? user.role;
  const effectiveStatus = nextState.status ?? user.status;

  if (
    effectiveRole === Role.PLATFORM_ADMIN &&
    effectiveStatus === UserStatus.ACTIVE
  ) {
    return null;
  }

  const adminCount = await countUsers({
    where: {
      role: Role.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  if (adminCount <= 1) {
    return jsonError(nextState.message, 400);
  }

  return null;
}

export async function updateManagedUserStatus(
  params: RouteParamsWithId,
  nextStatus: UserStatus,
  options?: ManagedUserStatusUpdateOptions,
  request?: Request,
) {
  const managed = await requireManagedUserContext(params, request);
  if ("error" in managed) {
    return managed.error;
  }

  const { user, actor } = managed;
  let previousStatus = user.status;

  let updated: User;
  try {
    updated = await withSerializableRetry(async () => {
      return prisma.$transaction(
        async (tx) => {
          const fresh = await tx.user.findUnique({ where: { id: user.id } });
          if (!fresh) {
            throw jsonError("User not found", 404);
          }

          if (
            options?.requireCurrentStatus &&
            fresh.status !== options.requireCurrentStatus
          ) {
            throw jsonError(
              options.blockedMessage ?? "User is in an invalid status",
              400,
            );
          }

          if (options?.lastAdminMessage) {
            const denied = await ensureAdminUserCanChange(
              fresh,
              {
                status: nextStatus,
                message: options.lastAdminMessage,
              },
              tx.user.count,
            );
            if (denied) {
              throw denied;
            }
          }

          previousStatus = fresh.status;
          return tx.user.update({
            where: { id: user.id },
            data: { status: nextStatus },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }

  await options?.afterUpdate?.({
    actorId: actor.id,
    userId: user.id,
    previousStatus,
    nextStatus,
  });

  await safeQueueUserStatusChangedNotifications({
    actorId: actor.id,
    user: {
      ...user,
      status: updated.status,
    },
    previousStatus,
    nextStatus: updated.status,
  });

  return Response.json({ user: { id: updated.id, status: updated.status } });
}

export async function updateManagedUserRole(
  params: RouteParamsWithId,
  body: { role?: Role },
  request?: Request,
) {
  if (!body.role) {
    return { error: jsonError("Role is required", 400) };
  }

  if (!Object.values(Role).includes(body.role)) {
    return { error: jsonError("Invalid role", 400) };
  }

  const managed = await requireManagedUserContext(params, request);
  if ("error" in managed) {
    return managed;
  }

  let updated: User;
  try {
    updated = await withSerializableRetry(async () => {
      return prisma.$transaction(
        async (tx) => {
          const fresh = await tx.user.findUnique({
            where: { id: managed.user.id },
          });
          if (!fresh) {
            throw jsonError("User not found", 404);
          }

          const denied = await ensureAdminUserCanChange(
            fresh,
            {
              role: body.role,
              message: "Cannot change role of the last Admin user",
            },
            tx.user.count,
          );
          if (denied) {
            throw denied;
          }

          return tx.user.update({
            where: { id: managed.user.id },
            data: { role: body.role },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });
  } catch (error) {
    if (error instanceof Response) {
      return { error };
    }
    throw error;
  }

  await safeLogAudit({
    action: AuditAction.ROLE_CHANGED,
    entityType: "User",
    entityId: managed.user.id,
    actorId: managed.actor.id,
    details: {
      from: managed.user.role,
      to: updated.role,
    },
  });

  await safeQueueRoleChangedNotifications({
    actorId: managed.actor.id,
    user: {
      ...managed.user,
      role: updated.role,
    },
    previousRole: managed.user.role,
    nextRole: updated.role,
  });

  return { user: { id: updated.id, role: updated.role } };
}

async function withSerializableRetry<T>(run: () => Promise<T>) {
  let attempt = 0;
  while (attempt < SERIALIZABLE_RETRY_LIMIT) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }

      if (
        isSerializableConflict(error) &&
        attempt < SERIALIZABLE_RETRY_LIMIT - 1
      ) {
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unreachable serializable retry state");
}

function isSerializableConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code === "P2034";
  }

  return false;
}
