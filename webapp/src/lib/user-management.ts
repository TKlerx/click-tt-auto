import type { User } from "../../generated/prisma/client";
import {
  AuthMethod,
  Role,
  ThemePreference,
  UserStatus,
} from "../../generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  ensureAdminUserCanChange as ensureAdminUserCanChangeInService,
  requireManagedUserContext,
  updateManagedUserStatus as updateManagedUserStatusInService,
} from "@/services/api/user-admin";

export async function provisionSsoUser(input: { email: string; name: string }) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    const authMethod =
      existing.authMethod === AuthMethod.LOCAL
        ? AuthMethod.BOTH
        : existing.authMethod;

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name || existing.name,
        authMethod,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      role: Role.SCOPE_USER,
      status: UserStatus.PENDING_APPROVAL,
      authMethod: AuthMethod.SSO,
      mustChangePassword: false,
      themePreference: ThemePreference.LIGHT,
    },
  });
}

type RouteParams = Promise<{ id: string }>;

type ManagedUserResult =
  | { error: Response }
  | {
      user: User;
      actor: {
        id: string;
      };
    };

export async function requireManagedUser(
  params: RouteParams,
  request?: Request,
): Promise<ManagedUserResult> {
  return requireManagedUserContext(params, request);
}

export async function ensureAdminUserCanChange(
  user: Pick<User, "role" | "status">,
  nextState: {
    role?: Role;
    status?: UserStatus;
    message: string;
  },
) {
  return ensureAdminUserCanChangeInService(user, nextState);
}

export async function updateManagedUserStatus(
  params: RouteParams,
  nextStatus: UserStatus,
  options?: {
    requireCurrentStatus?: UserStatus;
    blockedMessage?: string;
    lastAdminMessage?: string;
    afterUpdate?: (context: {
      actorId: string;
      userId: string;
      previousStatus: UserStatus;
      nextStatus: UserStatus;
    }) => Promise<void>;
  },
  request?: Request,
) {
  return updateManagedUserStatusInService(params, nextStatus, options, request);
}
