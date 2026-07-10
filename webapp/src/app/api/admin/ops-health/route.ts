import { NextResponse } from "next/server";
import { Role } from "../../../../../generated/prisma/enums";
import { requireApiUserWithRoles } from "@/lib/route-auth";
import { buildOpsHealthSnapshot } from "@/lib/ops-health";

export async function GET(request: Request) {
  const auth = await requireApiUserWithRoles([Role.PLATFORM_ADMIN], request);
  if ("error" in auth) {
    return auth.error;
  }

  try {
    return NextResponse.json(await buildOpsHealthSnapshot());
  } catch {
    return NextResponse.json(
      {
        error: "Could not assemble a safe ops health snapshot",
      },
      { status: 500 },
    );
  }
}
