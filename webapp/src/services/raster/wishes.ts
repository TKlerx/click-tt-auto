import { prisma } from "@/lib/db";
import type { WishJsonInput } from "@/lib/raster/schemas";
import {
  RasterConfidence,
  RasterWishSource,
  RasterWeekday,
} from "../../../generated/prisma/enums";
import type { WishParseResult } from "../../../../src/raster/ingest/index.js";
import type { Team } from "../../../../src/raster/types.js";

const weekdayMap: Record<Team["homeWeekday"], RasterWeekday> = {
  monday: RasterWeekday.MONDAY,
  tuesday: RasterWeekday.TUESDAY,
  wednesday: RasterWeekday.WEDNESDAY,
  thursday: RasterWeekday.THURSDAY,
  friday: RasterWeekday.FRIDAY,
  saturday: RasterWeekday.SATURDAY,
  sunday: RasterWeekday.SUNDAY,
};

export async function replaceParsedWishes(
  inputSetId: string,
  parsed: WishParseResult,
) {
  const clubsById = new Map(parsed.clubs.map((club) => [club.id, club]));
  await prisma.rasterWish.deleteMany({ where: { inputSetId } });
  if (!parsed.teams.length) return { count: 0 };

  return prisma.rasterWish.createMany({
    data: parsed.teams.map((team) => ({
      inputSetId,
      clubId: team.clubId,
      clubName: clubsById.get(team.clubId)?.name ?? team.clubId,
      teamLabel: team.label,
      homeWeekday: weekdayMap[team.homeWeekday],
      hall: team.hall,
      startTime: team.startTime,
      spielwochePref: team.spielwochePref,
      requestedRasterzahl: team.requestedRasterzahl
        ? JSON.stringify(team.requestedRasterzahl)
        : undefined,
      source: RasterWishSource.PDF_PARSED,
      confidence:
        team.confidence === "ok"
          ? RasterConfidence.OK
          : RasterConfidence.REVIEW,
    })),
  });
}

export async function replaceJsonWishes(
  inputSetId: string,
  wishes: WishJsonInput[],
  source: RasterWishSource = RasterWishSource.LLM_PASTED,
) {
  await prisma.rasterWish.deleteMany({ where: { inputSetId } });
  if (!wishes.length) return { count: 0 };

  return prisma.rasterWish.createMany({
    data: wishes.map((wish) => ({
      inputSetId,
      clubId: wish.clubId,
      clubName: wish.clubName,
      teamLabel: wish.teamLabel,
      homeWeekday: wish.homeWeekday,
      hall: wish.hall,
      startTime: wish.startTime,
      spielwochePref: wish.spielwochePref,
      requestedRasterzahl:
        wish.requestedRasterzahl === undefined
          ? undefined
          : JSON.stringify(wish.requestedRasterzahl),
      notes: wish.notes,
      source,
      confidence: RasterConfidence.REVIEW,
    })),
  });
}

export async function updateWish(wishId: string, wish: WishJsonInput) {
  return prisma.rasterWish.update({
    where: { id: wishId },
    data: {
      clubId: wish.clubId,
      clubName: wish.clubName,
      teamLabel: wish.teamLabel,
      homeWeekday: wish.homeWeekday,
      hall: wish.hall,
      startTime: wish.startTime,
      spielwochePref: wish.spielwochePref,
      requestedRasterzahl:
        wish.requestedRasterzahl === undefined
          ? undefined
          : JSON.stringify(wish.requestedRasterzahl),
      notes: wish.notes,
    },
  });
}
