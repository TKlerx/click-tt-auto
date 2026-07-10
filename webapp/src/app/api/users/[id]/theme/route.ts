import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import { updateOwnThemePreference } from "@/services/api/user-admin";
import { ThemePreference } from "../../../../../../generated/prisma/enums";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (auth.user.id !== id) return jsonError("Not authorized", 403);

  const body = (await request.json()) as { themePreference?: ThemePreference };
  const result = await updateOwnThemePreference(id, body);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ themePreference: result.themePreference });
}
