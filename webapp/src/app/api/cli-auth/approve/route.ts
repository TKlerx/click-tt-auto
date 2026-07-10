import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConfiguredBasePath, getScopedCookiePath } from "@/lib/azure-auth";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import {
  CLI_AUTH_CSRF_COOKIE,
  bindAuthCodeToUser,
} from "@/services/api/cli-auth";

function redirectToCliLogin(request: Request) {
  return NextResponse.redirect(
    new URL(`${getConfiguredBasePath()}/cli-login?error=1`, request.url),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const formData = await request.formData().catch(() => null);
  const requestId = formData?.get("request");
  const csrfToken = formData?.get("csrfToken");
  if (typeof requestId !== "string" || typeof csrfToken !== "string") {
    return jsonError("Invalid CLI approval request", 400);
  }

  const cookieStore = await cookies();
  const expectedCsrfToken = cookieStore.get(CLI_AUTH_CSRF_COOKIE)?.value;
  cookieStore.delete({
    name: CLI_AUTH_CSRF_COOKIE,
    path: getScopedCookiePath(),
  });

  if (!expectedCsrfToken || expectedCsrfToken !== csrfToken) {
    return jsonError("Invalid CLI approval request", 403);
  }

  const result = await bindAuthCodeToUser(requestId, auth.user.id);
  if ("error" in result) {
    return redirectToCliLogin(request);
  }

  const redirectUrl = new URL(result.authCode.callbackUrl);
  redirectUrl.searchParams.set("code", result.authCode.code);
  redirectUrl.searchParams.set("state", result.authCode.state);
  return NextResponse.redirect(redirectUrl);
}
