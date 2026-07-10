import { safeLogAudit } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/lib/route-auth";
import { createToken, listTokens } from "@/services/api/tokens";
import { AuditAction, TokenType } from "../../../../generated/prisma/enums";

const ALLOWED_EXPIRY_DAYS = [7, 30, 60, 90, 180, 365];

function parseShowAll(value: string | null) {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const tokens = await listTokens(
    auth.user.id,
    parseShowAll(url.searchParams.get("showAll")),
  );

  return Response.json({ tokens });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json()) as {
    name?: string;
    expiresInDays?: number;
  };

  const name = body.name?.trim() ?? "";
  if (!name || name.length > 100) {
    return jsonError("Token name must be between 1 and 100 characters", 400);
  }

  const expiresInDays = body.expiresInDays ?? 90;
  if (!ALLOWED_EXPIRY_DAYS.includes(expiresInDays)) {
    return jsonError(
      "Invalid expiration. Supported values: 7, 30, 60, 90, 180, 365",
      400,
    );
  }

  const result = await createToken(
    auth.user.id,
    name,
    expiresInDays,
    TokenType.PAT,
  );
  if ("error" in result) {
    return result.error;
  }

  await safeLogAudit({
    action: AuditAction.PAT_CREATED,
    entityType: "PersonalAccessToken",
    entityId: result.token.id,
    actorId: auth.user.id,
    details: {
      name: result.token.name,
      type: result.token.type,
      expiresAt: result.token.expiresAt,
    },
  });

  return Response.json({ token: result.token }, { status: 201 });
}
