import { lookupUserByEmail } from "@/services/api/user-admin";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email");
  const result = await lookupUserByEmail(email, request);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ user: result.user });
}
