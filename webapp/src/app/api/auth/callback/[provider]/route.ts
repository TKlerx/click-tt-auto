import { handleBetterAuthRoute } from "@/lib/better-auth-route";

export async function GET(request: Request) {
  return handleBetterAuthRoute(request);
}

export const POST = GET;
