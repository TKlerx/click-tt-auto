import { updateManagedUserRole } from "@/services/api/user-admin";
import { Role } from "../../../../../../generated/prisma/enums";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = (await request.json()) as { role?: Role };
  const result = await updateManagedUserRole(params, body, request);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ user: result.user });
}
