import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  createIntakeSubscription,
  listIntakeSubscriptions,
} from "@/services/teams/admin";
import { Role } from "../../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const subscriptions = await listIntakeSubscriptions();
  return Response.json({ subscriptions });
}

export async function POST(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    teamId?: string;
    channelId?: string;
    teamName?: string;
    channelName?: string;
  };

  if (!body.teamId?.trim() || !body.channelId?.trim()) {
    return Response.json(
      { error: "teamId and channelId are required" },
      { status: 400 },
    );
  }

  const result = await createIntakeSubscription({
    actorId: auth.user.id,
    teamId: body.teamId,
    channelId: body.channelId,
    teamName: body.teamName ?? null,
    channelName: body.channelName ?? null,
  });
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ subscription: result }, { status: 201 });
}
