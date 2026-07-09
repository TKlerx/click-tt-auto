import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  deleteDeliveryTarget,
  updateDeliveryTarget,
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
  const body = (await request.json()) as { name?: string; active?: boolean };
  if (body.name === undefined && body.active === undefined) {
    return Response.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return Response.json(
      { error: "active must be a boolean" },
      { status: 400 },
    );
  }

  const target = await updateDeliveryTarget(id, {
    name: body.name,
    active: body.active,
  });

  return Response.json({ target });
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
  const result = await deleteDeliveryTarget(id);
  if ("error" in result) {
    return result.error;
  }

  return new Response(null, { status: 204 });
}
