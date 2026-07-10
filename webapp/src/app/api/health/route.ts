import { NextResponse } from "next/server";
import { checkDatabaseHealth, getProcessHealth } from "@/lib/monitoring";

export async function GET(request: Request) {
  const [database, processHealth] = await Promise.all([
    checkDatabaseHealth(),
    Promise.resolve(getProcessHealth()),
  ]);

  const status = database.status === "ok" ? 200 : 503;
  const databaseCheck =
    database.status === "ok"
      ? { status: "ok" as const }
      : { status: "error" as const };

  return NextResponse.json(
    {
      status: database.status === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      requestId: request.headers.get("x-request-id"),
      checks: {
        database: databaseCheck,
        process:
          processHealth.status === "ok"
            ? { status: "ok" as const }
            : { status: "error" as const },
      },
    },
    { status },
  );
}
