import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  parseNotificationEventType,
  updateNotificationTypeConfiguration,
} from "@/services/notifications/admin";
import { Role } from "../../../../../../generated/prisma/enums";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventType: string }> },
) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const { eventType } = await params;
  const parsedEventType = parseNotificationEventType(eventType);
  if ("error" in parsedEventType) {
    return parsedEventType.error;
  }

  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "enabled must be a boolean" },
      { status: 400 },
    );
  }

  const result = await updateNotificationTypeConfiguration(
    parsedEventType.eventType!,
    auth.user.id,
    body.enabled,
  );
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ config: result.config });
}
