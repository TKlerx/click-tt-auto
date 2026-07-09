import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { buildSessionResponse } from "@/services/api/session";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return jsonError("Not authenticated", 401);
  }

  return buildSessionResponse(user);
}
