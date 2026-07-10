import { getSessionUser } from "@/lib/auth";
import { signOutUser } from "@/services/api/auth";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  return signOutUser(request, sessionUser);
}
