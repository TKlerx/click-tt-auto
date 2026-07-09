import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getScopedCookiePath } from "@/lib/azure-auth";
import { getAbsoluteAppUrl } from "@/lib/better-auth-route";
import { jsonError } from "@/lib/http";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  CLI_AUTH_CSRF_COOKIE,
  CLI_AUTH_CSRF_QUERY_PARAM,
  cleanupExpiredCodes,
  createAuthCode,
  isValidCliCallbackUrl,
} from "@/services/api/cli-auth";

const MAX_CALLBACK_URL_LENGTH = 300;
const MAX_STATE_LENGTH = 256;

function getAuthorizeRateLimitKey(
  request: Request,
  callbackUrl: string | null,
  state: string | null,
) {
  const clientIp = getClientIp(request);
  if (clientIp !== "unknown") {
    return `ip:${clientIp}`;
  }

  const stateKey = (state?.trim() || "missing-state").slice(
    0,
    MAX_STATE_LENGTH,
  );
  const callbackKey = (callbackUrl ?? "missing-callback").slice(
    0,
    MAX_CALLBACK_URL_LENGTH,
  );
  return `request:${stateKey}:${callbackKey}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callback_url");
  const state = url.searchParams.get("state");

  const rateLimit = checkRateLimit(
    getAuthorizeRateLimitKey(request, callbackUrl, state),
    "cli-auth-authorize",
    {
      maxAttempts: 20,
    },
  );
  if (!rateLimit.allowed) {
    const response = jsonError(
      "Too many CLI authorization attempts. Please try again later.",
      429,
    );
    response.headers.set(
      "Retry-After",
      Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
    );
    return response;
  }

  if (
    (callbackUrl && callbackUrl.length > MAX_CALLBACK_URL_LENGTH) ||
    (state && state.length > MAX_STATE_LENGTH)
  ) {
    return jsonError("CLI authorization request is too large", 400);
  }

  if (!callbackUrl || !isValidCliCallbackUrl(callbackUrl)) {
    return jsonError(
      "callback_url must target http://localhost or http://127.0.0.1",
      400,
    );
  }

  if (!state?.trim()) {
    return jsonError("state is required", 400);
  }

  await cleanupExpiredCodes();
  const authCode = await createAuthCode(callbackUrl, state);
  const approvalToken = crypto.randomBytes(32).toString("base64url");
  const redirectTarget = `/login?redirectTo=${encodeURIComponent(`/cli-login?request=${authCode.id}&${CLI_AUTH_CSRF_QUERY_PARAM}=${approvalToken}`)}`;

  const response = NextResponse.redirect(getAbsoluteAppUrl(redirectTarget));
  response.cookies.set({
    name: CLI_AUTH_CSRF_COOKIE,
    value: approvalToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: getScopedCookiePath(),
    expires: authCode.expiresAt,
  });
  return response;
}
