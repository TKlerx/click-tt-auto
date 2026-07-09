import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  listNotificationLog,
  parseNotificationEventType,
  parseNotificationStatus,
} from "@/services/notifications/admin";
import { Role } from "../../../../generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const parsedEventType = parseNotificationEventType(
    url.searchParams.get("eventType"),
  );
  if ("error" in parsedEventType) {
    return parsedEventType.error;
  }

  const parsedStatus = parseNotificationStatus(url.searchParams.get("status"));
  if ("error" in parsedStatus) {
    return parsedStatus.error;
  }

  const notifications = await listNotificationLog({
    eventType: parsedEventType.eventType,
    status: parsedStatus.status,
  });

  return Response.json({ notifications });
}
