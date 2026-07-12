import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/route-auth";
import { assertRasterAccess } from "@/lib/raster/access";
import { prisma } from "@/lib/db";
import { refreshRasterSource } from "@/services/raster";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const source = await prisma.rasterSource.findUnique({
    where: { id: (await params).id },
    include: { scope: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const access = await assertRasterAccess(auth.user, source.scope.code, "admin");
  if (access !== true) return access.error;

  try {
    const refreshed = await refreshRasterSource(source.id);
    return NextResponse.json({
      source: refreshed,
      summary: summarizeParsedSource(refreshed?.parsedJson),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Source refresh failed",
      },
      { status: 422 },
    );
  }
}

function summarizeParsedSource(parsedJson?: string | null) {
  if (!parsedJson) return "No parsed data";
  let parsed: {
    assignments?: unknown[];
    clubs?: unknown[];
    teams?: unknown[];
    wishes?: unknown[];
  };
  try {
    parsed = JSON.parse(parsedJson) as typeof parsed;
  } catch {
    return "Parsed data saved";
  }
  const parts = [
    countLabel(parsed.assignments, "assignment"),
    countLabel(parsed.clubs, "club"),
    countLabel(parsed.teams, "team"),
    countLabel(parsed.wishes, "wish"),
  ].filter(Boolean);
  return parts.length ? `Parsed ${parts.join(", ")}` : "Parsed data saved";
}

function countLabel(rows: unknown[] | undefined, label: string) {
  if (!rows?.length) return null;
  return `${rows.length} ${label}${rows.length === 1 ? "" : "s"}`;
}
