import type { SessionUser } from "@/lib/auth";
import { touchTokenLastUsed, validateToken } from "@/services/api/tokens";
import { UserStatus } from "../../generated/prisma/enums";

function getTokenValueFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const apiKey = request.headers.get("x-api-key")?.trim();
  return apiKey || null;
}

export async function resolveTokenUser(
  request: Request,
): Promise<SessionUser | null> {
  const tokenValue = getTokenValueFromRequest(request);
  if (!tokenValue) {
    return null;
  }

  const tokenRecord = await validateToken(tokenValue);
  if (!tokenRecord) {
    return null;
  }

  if (
    tokenRecord.user.status === UserStatus.INACTIVE ||
    tokenRecord.user.status === UserStatus.PENDING_APPROVAL
  ) {
    return null;
  }

  void touchTokenLastUsed(tokenRecord.id);

  return tokenRecord.user;
}
