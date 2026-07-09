import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  createDeliveryTarget,
  listDeliveryTargets,
} from "@/services/teams/admin";
import { Role } from "../../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const targets = await listDeliveryTargets();
  return Response.json({ targets });
}

export async function POST(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    name?: string;
    teamId?: string;
    channelId?: string;
    teamName?: string;
    channelName?: string;
  };

  if (!body.name?.trim() || !body.teamId?.trim() || !body.channelId?.trim()) {
    return Response.json(
      { error: "name, teamId, and channelId are required" },
      { status: 400 },
    );
  }

  const result = await createDeliveryTarget({
    actorId: auth.user.id,
    name: body.name,
    teamId: body.teamId,
    channelId: body.channelId,
    teamName: body.teamName ?? null,
    channelName: body.channelName ?? null,
  });
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ target: result }, { status: 201 });
}
