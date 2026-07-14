import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRasterInputSet } from "@/lib/raster/route-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const context = await requireRasterInputSet(request, id, "viewer");
  if ("error" in context) return context.error;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) {
    return NextResponse.json({ wishes: [] });
  }

  const wishes = await prisma.rasterWish.findMany({
    where: { inputSetId: context.inputSet.id },
    select: {
      id: true,
      clubId: true,
      clubName: true,
      teamLabel: true,
      homeWeekday: true,
      hall: true,
      startTime: true,
      spielwochePref: true,
    },
  });

  return NextResponse.json({
    wishes: wishes
      .map((wish) => ({
        id: wish.id,
        label: `${wish.clubName}${wish.teamLabel ? ` ${wish.teamLabel}` : ""}`,
        fields: [
          wish.homeWeekday.toLowerCase(),
          wish.startTime,
          wish.hall ? `Gym ${wish.hall}` : "",
          wish.spielwochePref ? `W${wish.spielwochePref}` : "",
        ]
          .filter(Boolean)
          .join(", "),
        score: Math.min(
          100,
          Math.round((scoreWish(normalizedQuery, wish) / 30) * 100),
        ),
      }))
      .filter((wish) => wish.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 50),
  });
}

function scoreWish(
  query: string,
  wish: { clubId: string; clubName: string; teamLabel: string | null },
) {
  return (
    scoreText(query, wish.clubId) +
    scoreText(query, wish.clubName) +
    scoreText(query, wish.teamLabel ?? "")
  );
}

function scoreText(query: string, value: string) {
  const normalized = normalize(value);
  if (!normalized) return 0;
  if (normalized === query) return 20;
  if (normalized.includes(query)) return 10;
  return query
    .split(/\s+/)
    .filter((part) => part.length > 1 && normalized.includes(part)).length;
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}
