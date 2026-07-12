import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import type { CapacityCsvRowInput } from "@/lib/raster/schemas";
import { HallCapacityBasis } from "../../../generated/prisma/enums";

export async function listHallCapacities(district: string) {
  return prisma.rasterHallCapacity.findMany({
    where: rasterDistrictWhere(district),
    orderBy: [{ clubId: "asc" }, { hall: "asc" }, { weekday: "asc" }],
  });
}

export async function searchHallCapacities(
  district: string,
  q?: string | null,
) {
  return prisma.rasterHallCapacity.findMany({
    where: {
      district,
      ...(q
        ? {
            OR: [{ clubId: { contains: q } }, { hall: { contains: q } }],
          }
        : {}),
    },
    orderBy: [{ clubId: "asc" }, { hall: "asc" }, { weekday: "asc" }],
  });
}

export async function upsertHallCapacities(
  rows: CapacityCsvRowInput[],
  updatedById: string,
) {
  for (const row of rows) {
    await prisma.rasterHallCapacity.upsert({
      where: {
        district_clubId_hall_weekday: {
          district: row.district,
          clubId: row.clubId,
          hall: row.hall,
          weekday: row.weekday,
        },
      },
      update: {
        capacity: row.capacity,
        basis: HallCapacityBasis.REVIEWED,
        updatedById,
      },
      create: {
        ...row,
        basis: HallCapacityBasis.REVIEWED,
        updatedById,
      },
    });
  }
  await markDistrictSnapshotsStale([
    ...new Set(rows.map((row) => row.district)),
  ]);
  return { count: rows.length };
}

export async function inferHallCapacitiesFromInputSet(
  inputSetId: string,
  updatedById: string,
) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { district: true, seasonModelJson: true },
  });
  if (!inputSet?.seasonModelJson) return { count: 0 };

  const model = JSON.parse(inputSet.seasonModelJson) as {
    teams?: Array<{
      clubId?: string;
      hall?: string;
      homeWeekday?: string;
      spielwochePref?: string;
    }>;
  };
  const bySlot = new Map<string, number>();
  for (const team of model.teams ?? []) {
    if (!team.clubId || !team.homeWeekday || !team.spielwochePref) continue;
    const key = [
      team.clubId,
      team.hall || "1",
      team.homeWeekday.toUpperCase(),
      team.spielwochePref,
    ].join("\0");
    bySlot.set(key, (bySlot.get(key) ?? 0) + 1);
  }

  const inferred = new Map<string, { clubId: string; hall: string; weekday: string; capacity: number }>();
  for (const [key, count] of bySlot) {
    const [clubId, hall, weekday] = key.split("\0");
    const capacityKey = [clubId, hall, weekday].join("\0");
    const current = inferred.get(capacityKey);
    inferred.set(capacityKey, {
      clubId: clubId!,
      hall: hall!,
      weekday: weekday!,
      capacity: Math.max(current?.capacity ?? 0, count),
    });
  }

  let count = 0;
  for (const row of inferred.values()) {
    const existing = await prisma.rasterHallCapacity.findUnique({
      where: {
        district_clubId_hall_weekday: {
          district: inputSet.district,
          clubId: row.clubId,
          hall: row.hall,
          weekday: row.weekday as never,
        },
      },
      select: { basis: true },
    });
    if (existing?.basis === HallCapacityBasis.REVIEWED) continue;
    await prisma.rasterHallCapacity.upsert({
      where: {
        district_clubId_hall_weekday: {
          district: inputSet.district,
          clubId: row.clubId,
          hall: row.hall,
          weekday: row.weekday as never,
        },
      },
      update: {
        capacity: row.capacity,
        basis: HallCapacityBasis.INFERRED,
        updatedById,
      },
      create: {
        district: inputSet.district,
        clubId: row.clubId,
        hall: row.hall,
        weekday: row.weekday as never,
        capacity: row.capacity,
        basis: HallCapacityBasis.INFERRED,
        updatedById,
      },
    });
    count += 1;
  }
  await markDistrictSnapshotsStale([inputSet.district]);
  return { count };
}

export async function updateHallCapacity(
  id: string,
  data: { capacity: number; basis?: HallCapacityBasis; updatedById: string },
) {
  const capacity = await prisma.rasterHallCapacity.update({
    where: { id },
    data,
  });
  await markDistrictSnapshotsStale([capacity.district]);
  return capacity;
}

async function markDistrictSnapshotsStale(districts: string[]) {
  for (const district of districts) {
    await prisma.rasterSnapshot.updateMany({
      where: { district },
      data: { stale: true },
    });
  }
}
