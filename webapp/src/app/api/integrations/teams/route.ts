import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  getIntegrationStatus,
  updateTeamsConfig,
} from "@/services/teams/admin";
import { Role } from "../../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const status = await getIntegrationStatus();
  return Response.json(status);
}

export async function PUT(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    sendEnabled?: boolean;
    intakeEnabled?: boolean;
  };

  if (body.sendEnabled !== undefined && typeof body.sendEnabled !== "boolean") {
    return Response.json(
      { error: "sendEnabled must be a boolean" },
      { status: 400 },
    );
  }
  if (
    body.intakeEnabled !== undefined &&
    typeof body.intakeEnabled !== "boolean"
  ) {
    return Response.json(
      { error: "intakeEnabled must be a boolean" },
      { status: 400 },
    );
  }

  await updateTeamsConfig({
    actorId: auth.user.id,
    sendEnabled: body.sendEnabled,
    intakeEnabled: body.intakeEnabled,
  });

  const status = await getIntegrationStatus();
  return Response.json(status);
}
