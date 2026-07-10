import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiUserWithRoles } from "@/lib/route-auth";
import {
  createTeamsConsentState,
  getTeamsConsentAppRedirectPath,
  getTeamsAuthorizeUrl,
  getTeamsConsentCookiePath,
  TEAMS_CONSENT_STATE_COOKIE,
} from "@/services/teams/consent";
import { Role } from "../../../../../../../generated/prisma/enums";

function isSafeLocalRedirectPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\r\n]/.test(value)
  );
}

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo");
  const safeRedirect =
    redirectTo && isSafeLocalRedirectPath(redirectTo)
      ? getTeamsConsentAppRedirectPath(redirectTo)
      : "/admin/integrations/teams";
  const finalRedirect = getTeamsConsentAppRedirectPath(safeRedirect);

  const state = createTeamsConsentState();
  const cookieStore = await cookies();
  cookieStore.set(TEAMS_CONSENT_STATE_COOKIE, `${state}:${finalRedirect}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: getTeamsConsentCookiePath(),
    maxAge: 10 * 60,
  });

  const authorizeUrl = getTeamsAuthorizeUrl(request, state);
  return NextResponse.redirect(authorizeUrl);
}
