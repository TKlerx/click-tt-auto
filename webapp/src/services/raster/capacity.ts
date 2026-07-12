import { prisma } from "@/lib/db";
import { rasterDistrictWhere } from "@/lib/raster/access";
import type { CapacityCsvRowInput } from "@/lib/raster/schemas";
import {
  HallCapacityBasis,
  type RasterWeekday,
} from "../../../generated/prisma/enums";

type InferredHallCapacity = {
  district: string;
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
  capacity: number;
};

export type HallCapacityReview = {
  inferredCount: number;
  missingCount: number;
  insufficientCount: number;
  blockingCount: number;
};

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
  const inferred = await inferCapacityRows(inputSetId);
  const existing = await existingCapacityMap(inferred);

  let count = 0;
  let needsReview = 0;
  for (const row of inferred) {
    const stored = existing.get(capacityKey(row));
    if (stored) {
      if (stored.capacity < row.capacity) needsReview += 1;
      continue;
    }
    await prisma.rasterHallCapacity.create({
      data: {
        district: row.district,
        clubId: row.clubId,
        hall: row.hall,
        weekday: row.weekday,
        capacity: row.capacity,
        basis: HallCapacityBasis.INFERRED,
        updatedById,
      },
    });
    count += 1;
  }
  if (count > 0) {
    await markDistrictSnapshotsStale([
      ...new Set(inferred.map((row) => row.district)),
    ]);
  }
  return { count, needsReview };
}

export async function reviewHallCapacitiesForInputSet(
  inputSetId: string,
): Promise<HallCapacityReview> {
  const inferred = await inferCapacityRows(inputSetId);
  const existing = await existingCapacityMap(inferred);
  let missingCount = 0;
  let insufficientCount = 0;

  for (const row of inferred) {
    const stored = existing.get(capacityKey(row));
    if (!stored) {
      missingCount += 1;
    } else if (stored.capacity < row.capacity) {
      insufficientCount += 1;
    }
  }

  return {
    inferredCount: inferred.length,
    missingCount,
    insufficientCount,
    blockingCount: missingCount + insufficientCount,
  };
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

async function inferCapacityRows(
  inputSetId: string,
): Promise<InferredHallCapacity[]> {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { district: true, seasonModelJson: true },
  });
  if (!inputSet?.seasonModelJson) return [];

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
    const weekday = normalizeWeekday(team.homeWeekday);
    if (!team.clubId || !weekday || !team.spielwochePref) continue;
    const key = [
      team.clubId,
      team.hall || "1",
      weekday,
      team.spielwochePref,
    ].join("\0");
    bySlot.set(key, (bySlot.get(key) ?? 0) + 1);
  }

  const inferred = new Map<string, InferredHallCapacity>();
  for (const [key, count] of bySlot) {
    const [clubId, hall, weekday] = key.split("\0") as [
      string,
      string,
      RasterWeekday,
      string,
    ];
    const rowKey = [inputSet.district, clubId, hall, weekday].join("\0");
    const current = inferred.get(rowKey);
    inferred.set(rowKey, {
      district: inputSet.district,
      clubId,
      hall,
      weekday,
      capacity: Math.max(current?.capacity ?? 0, count),
    });
  }
  return [...inferred.values()];
}

async function existingCapacityMap(inferred: InferredHallCapacity[]) {
  if (!inferred.length) return new Map<string, { capacity: number }>();
  const districts = [...new Set(inferred.map((row) => row.district))];
  const existing = await prisma.rasterHallCapacity.findMany({
    where: { district: { in: districts } },
    select: {
      district: true,
      clubId: true,
      hall: true,
      weekday: true,
      capacity: true,
    },
  });
  return new Map(existing.map((row) => [capacityKey(row), row]));
}

function capacityKey(row: {
  district: string;
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
}) {
  return [row.district, row.clubId, row.hall, row.weekday].join("\0");
}

function normalizeWeekday(value: string | undefined): RasterWeekday | null {
  if (!value) return null;
  const weekday = value.toUpperCase();
  if (
    weekday === "MONDAY" ||
    weekday === "TUESDAY" ||
    weekday === "WEDNESDAY" ||
    weekday === "THURSDAY" ||
    weekday === "FRIDAY" ||
    weekday === "SATURDAY" ||
    weekday === "SUNDAY"
  ) {
    return weekday;
  }
  return null;
}
