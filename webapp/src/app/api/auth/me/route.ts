import { requireApiUser } from "@/lib/route-auth";
import { buildSessionResponse } from "@/services/api/session";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  return buildSessionResponse(auth.user);
}
