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
