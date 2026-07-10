import {
  authorizeRouteContext,
  requireRouteUser,
  requireRouteUserWithRoles,
} from "@/services/api/route-context";
import { Role } from "../../generated/prisma/enums";
import type { AuthorizeRouteOptions } from "@/services/api/types";

export async function requireApiUser(request?: Request) {
  return requireRouteUser(request);
}

export async function requireApiUserWithRoles(
  roles: Role[],
  request?: Request,
) {
  return requireRouteUserWithRoles(roles, request);
}

export async function authorizeRoute(
  request: Request,
  options: AuthorizeRouteOptions = {},
) {
  return authorizeRouteContext(request, options);
}
