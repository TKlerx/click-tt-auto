import { NextResponse } from "next/server";
export function applySetCookieHeaders(
  response: NextResponse,
  source: Response,
) {
  const setCookieHeader =
    typeof source.headers.getSetCookie === "function"
      ? source.headers.getSetCookie()
      : source.headers.get("set-cookie");

  if (Array.isArray(setCookieHeader)) {
    for (const cookie of setCookieHeader) {
      response.headers.append("set-cookie", cookie);
    }
  } else if (setCookieHeader) {
    response.headers.set("set-cookie", setCookieHeader);
  }

  return response;
}
