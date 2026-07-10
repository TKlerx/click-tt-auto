import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  deleteIntakeSubscription,
  updateIntakeSubscription,
} from "@/services/teams/admin";
import { Role } from "../../../../../../../generated/prisma/enums";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const body = (await request.json()) as { active?: boolean };
  if (typeof body.active !== "boolean") {
    return Response.json(
      { error: "active must be a boolean" },
      { status: 400 },
    );
  }

  const subscription = await updateIntakeSubscription(id, {
    active: body.active,
  });

  return Response.json({ subscription });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const result = await deleteIntakeSubscription(id);
  if ("error" in result) {
    return result.error;
  }

  return new Response(null, { status: 204 });
}
