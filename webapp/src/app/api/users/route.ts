import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  createLocalUser,
  listUsers,
  parseUserStatusFilter,
} from "@/services/api/user-admin";
import { Role } from "../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const parsedStatus = parseUserStatusFilter(url.searchParams.get("status"));
  if ("error" in parsedStatus) {
    return parsedStatus.error;
  }

  const users = await listUsers(parsedStatus.status);

  return Response.json({
    users,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    email?: string;
    name?: string;
    role?: Role;
    temporaryPassword?: string;
  };

  const result = await createLocalUser(auth.user.id, body);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ user: result.user }, { status: 201 });
}
