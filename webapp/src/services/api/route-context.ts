import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { resolveTokenUser } from "@/lib/token-auth";
import { checkScopeAccess, checkRole } from "@/lib/rbac";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import type {
  AuthorizeRouteOptions,
  RouteUserResult,
} from "@/services/api/types";

export async function requireRouteUser(
  request?: Request,
): Promise<RouteUserResult> {
  const user =
    (await getSessionUser()) ??
    (request ? await resolveTokenUser(request) : null);

  if (!user) {
    return { error: jsonError("Not authenticated", 401) };
  }

  if (user.status === UserStatus.PENDING_APPROVAL) {
    return { error: jsonError("Your account is pending approval", 403) };
  }

  return request ? { user, request } : { user };
}

export async function requireRouteUserWithRoles(
  roles: Role[],
  request?: Request,
): Promise<RouteUserResult> {
  const auth = await requireRouteUser(request);
  if ("error" in auth) {
    return auth;
  }

  if (!checkRole(auth.user, roles)) {
    return { error: jsonError("Not authorized", 403) };
  }

  return auth;
}

async function resolveScopeId(
  request: Request,
  options: AuthorizeRouteOptions,
) {
  if (options.scopeId) {
    return options.scopeId;
  }

  if (options.resolveScopeId) {
    return await options.resolveScopeId(request);
  }

  return new URL(request.url).searchParams.get("scopeId");
}

export async function authorizeRouteContext(
  request: Request,
  options: AuthorizeRouteOptions = {},
): Promise<RouteUserResult> {
  const auth = await requireRouteUser(request);
  if ("error" in auth) {
    return auth;
  }

  if (options.roles?.length && !checkRole(auth.user, options.roles)) {
    return { error: jsonError("Not authorized", 403) };
  }

  if (options.scopeRestricted) {
    const scopeId = await resolveScopeId(request, options);

    if (!scopeId) {
      return { error: jsonError("Scope ID is required", 400) };
    }

    const hasAccess = await checkScopeAccess(auth.user, scopeId);
    if (!hasAccess) {
      return { error: jsonError("Not authorized for this scope", 403) };
    }
  }

  return auth;
}
