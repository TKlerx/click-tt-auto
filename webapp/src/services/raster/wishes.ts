import { prisma } from "@/lib/db";
import type { WishJsonInput } from "@/lib/raster/schemas";
import {
  RasterConfidence,
  RasterWishSource,
  RasterWeekday,
} from "../../../generated/prisma/enums";
import type { WishParseResult } from "../../../../src/raster/ingest/wishes-pdf.js";
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
  const teams = dedupeTeams(parsed.teams);
  await prisma.$transaction(async (tx) => {
    await tx.rasterInputSet.update({
      where: { id: inputSetId },
      data: { wishesJson: JSON.stringify({ ...parsed, teams }) },
    });
    await tx.rasterWish.deleteMany({ where: { inputSetId } });
    if (teams.length) {
      await tx.rasterWish.createMany({
        data: teams.map((team) => ({
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
  });

  return { count: teams.length };
}

function dedupeTeams(parsedTeams: WishParseResult["teams"]) {
  const seen = new Set<string>();
  return parsedTeams.filter((team) => {
    const key = [
      team.clubId,
      team.label,
      team.homeWeekday,
      team.hall,
      team.startTime ?? "",
      team.spielwochePref ?? "",
      JSON.stringify(team.requestedRasterzahl ?? null),
    ].join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function replaceJsonWishes(
  inputSetId: string,
  wishes: WishJsonInput[],
  source: RasterWishSource = RasterWishSource.LLM_PASTED,
) {
  await prisma.$transaction(async (tx) => {
    await tx.rasterInputSet.update({
      where: { id: inputSetId },
      data: { wishesJson: JSON.stringify({ wishes }) },
    });
    await tx.rasterWish.deleteMany({ where: { inputSetId } });
    if (wishes.length) {
      await tx.rasterWish.createMany({
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
  });

  return { count: wishes.length };
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
