import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";

export function buildSessionResponse(user: SessionUser) {
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      themePreference: user.themePreference,
    },
  });
}
