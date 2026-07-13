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

type CapacitySlot = {
  clubId: string;
  hall: string;
  weekday: RasterWeekday;
  startMinutes: number | null;
  durationMinutes: number;
};

export type HallCapacityReviewRow = InferredHallCapacity & {
  id: string | null;
  storedCapacity: number | null;
  basis: HallCapacityBasis | null;
  status: "missing" | "insufficient" | "higher";
};

export type HallCapacityReview = {
  inferredCount: number;
  missingCount: number;
  insufficientCount: number;
  higherCount: number;
  blockingCount: number;
  rows: HallCapacityReviewRow[];
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
  let higherCount = 0;
  const rows: HallCapacityReviewRow[] = [];

  for (const row of inferred) {
    const stored = existing.get(capacityKey(row));
    if (!stored) {
      missingCount += 1;
      rows.push({
        ...row,
        id: null,
        storedCapacity: null,
        basis: null,
        status: "missing",
      });
    } else if (stored.capacity < row.capacity) {
      insufficientCount += 1;
      rows.push({
        ...row,
        id: stored.id,
        storedCapacity: stored.capacity,
        basis: stored.basis,
        status: "insufficient",
      });
    } else if (stored.capacity > row.capacity) {
      higherCount += 1;
      rows.push({
        ...row,
        id: stored.id,
        storedCapacity: stored.capacity,
        basis: stored.basis,
        status: "higher",
      });
    }
  }

  return {
    inferredCount: inferred.length,
    missingCount,
    insufficientCount,
    higherCount,
    blockingCount: missingCount + insufficientCount,
    rows,
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
    select: {
      district: true,
      seasonModelJson: true,
      wishes: {
        select: {
          clubId: true,
          teamLabel: true,
          hall: true,
          homeWeekday: true,
          startTime: true,
          spielwochePref: true,
        },
      },
    },
  });
  if (!inputSet) return [];

  const model = inputSet.seasonModelJson
    ? (JSON.parse(inputSet.seasonModelJson) as {
        teams?: Array<{
          clubId?: string;
          id?: string;
          label?: string;
          teamLabel?: string;
          hall?: string;
          homeWeekday?: string;
          startTime?: string;
          spielwochePref?: string;
        }>;
      })
    : { teams: [] };
  const bySlot = new Map<string, CapacitySlot[]>();
  const seen = new Set<string>();
  for (const team of model.teams ?? []) {
    addCapacitySlot(bySlot, seen, team);
  }
  for (const wish of inputSet.wishes) {
    addCapacitySlot(bySlot, seen, wish);
  }

  const inferred = new Map<string, InferredHallCapacity>();
  for (const [key, slots] of bySlot) {
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
      capacity: Math.max(current?.capacity ?? 0, requiredCapacity(slots)),
    });
  }
  return [...inferred.values()];
}

function addCapacitySlot(
  bySlot: Map<string, CapacitySlot[]>,
  seen: Set<string>,
  row: {
    clubId?: string | null;
    id?: string | null;
    label?: string | null;
    teamLabel?: string | null;
    hall?: string | null;
    homeWeekday?: string | null;
    startTime?: string | null;
    spielwochePref?: string | null;
  },
) {
  const weekday = normalizeWeekday(row.homeWeekday ?? undefined);
  if (!row.clubId || !weekday) return;
  const slot: CapacitySlot = {
    clubId: row.clubId,
    hall: row.hall || "1",
    weekday,
    startMinutes: parseStartMinutes(row.startTime),
    durationMinutes: matchDurationMinutes(row.teamLabel ?? row.label),
  };
  const identity = [
    row.clubId,
    row.teamLabel ?? row.label ?? row.id ?? "",
    slot.hall,
    weekday,
    row.startTime ?? "",
    row.spielwochePref ?? "",
  ].join("\0");
  if (seen.has(identity)) return;
  seen.add(identity);

  if (row.spielwochePref === "A" || row.spielwochePref === "B") {
    const key = [
      row.clubId,
      slot.hall,
      weekday,
      row.spielwochePref,
    ].join("\0");
    bySlot.set(key, [...(bySlot.get(key) ?? []), slot]);
    return;
  }

  const keyA = [row.clubId, slot.hall, weekday, "A"].join("\0");
  const keyB = [row.clubId, slot.hall, weekday, "B"].join("\0");
  const candidateA = [...(bySlot.get(keyA) ?? []), slot];
  const candidateB = [...(bySlot.get(keyB) ?? []), slot];
  const targetKey =
    requiredCapacity(candidateA) <= requiredCapacity(candidateB) ? keyA : keyB;
  bySlot.set(targetKey, [...(bySlot.get(targetKey) ?? []), slot]);
}

function requiredCapacity(slots: CapacitySlot[]) {
  const unknownTimes = slots.filter((slot) => slot.startMinutes === null).length;
  const events = slots
    .filter((slot): slot is CapacitySlot & { startMinutes: number } =>
      Number.isInteger(slot.startMinutes),
    )
    .flatMap((slot) => [
      { minute: slot.startMinutes, delta: 1 },
      { minute: slot.startMinutes + slot.durationMinutes, delta: -1 },
    ])
    .sort((a, b) => a.minute - b.minute || a.delta - b.delta);

  let concurrent = 0;
  let maxConcurrent = 0;
  for (const event of events) {
    concurrent += event.delta;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  return maxConcurrent + unknownTimes;
}

function matchDurationMinutes(label: string | null | undefined) {
  return /\bjugend\b/i.test(label ?? "") ? 120 : 180;
}

function parseStartMinutes(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

async function existingCapacityMap(inferred: InferredHallCapacity[]) {
  if (!inferred.length) {
    return new Map<
      string,
      { id: string; capacity: number; basis: HallCapacityBasis }
    >();
  }
  const districts = [...new Set(inferred.map((row) => row.district))];
  const existing = await prisma.rasterHallCapacity.findMany({
    where: { district: { in: districts } },
    select: {
      id: true,
      district: true,
      clubId: true,
      hall: true,
      weekday: true,
      capacity: true,
      basis: true,
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
