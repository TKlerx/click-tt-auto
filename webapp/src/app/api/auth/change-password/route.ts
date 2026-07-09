import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/route-auth";
import { jsonError } from "@/lib/http";
import { changePasswordForUser } from "@/services/api/auth";

export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  const clientIp = getClientIp(request);
  const bucketKey =
    clientIp === "unknown" ? `user:${user.id}` : `ip:${clientIp}`;
  const rateLimit = checkRateLimit(bucketKey, "change-password");
  if (!rateLimit.allowed) {
    const response = jsonError(
      "Too many attempts. Please try again later.",
      429,
    );
    response.headers.set(
      "Retry-After",
      Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
    );
    return response;
  }

  const body = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };
  return changePasswordForUser(request, user, body);
}
