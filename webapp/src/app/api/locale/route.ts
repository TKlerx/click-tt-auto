import { NextResponse } from "next/server";
import { locales, type Locale } from "@/i18n/config";
import { getUserLocaleCookieHeaders } from "@/i18n/locale";

export async function POST(request: Request) {
  const body = (await request.json()) as { locale?: string };

  if (!body.locale || !locales.includes(body.locale as Locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const locale = body.locale as Locale;
  const response = NextResponse.json({ ok: true });

  for (const cookie of getUserLocaleCookieHeaders(locale)) {
    response.headers.append("Set-Cookie", cookie);
  }

  return response;
}
