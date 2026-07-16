import { createHash } from "node:crypto";
import { RasterMatchRecordType } from "../../../generated/prisma/enums";

type TeamMatchRecord = {
  id?: string | null;
  clubId?: string | null;
  clubName?: string | null;
  label?: string | null;
  name?: string | null;
  wishMatchId?: string | null;
  homeWeekday?: string | null;
  hall?: string | null;
  startTime?: string | null;
  spielwochePref?: string | null;
};

export type RasterMatchReviewState = {
  recordId: string;
  label: string;
  fingerprint: string;
  status: "settled" | "outstanding";
  reason: "never_reviewed" | "changed" | null;
};

export function rasterMatchFingerprint(record: TeamMatchRecord) {
  return hash({
    recordId: normalizeMatchText(record.id),
    clubId: normalizeMatchText(record.clubId),
    clubName: normalizeMatchText(record.clubName),
    team: normalizeMatchText(record.label ?? record.name),
    wishMatchId: normalizeMatchText(record.wishMatchId),
    homeWeekday: normalizeMatchText(record.homeWeekday),
    hall: normalizeMatchText(record.hall),
    startTime: normalizeMatchText(record.startTime),
    spielwochePref: normalizeMatchText(record.spielwochePref),
  });
}

export function deriveMatchReviewState(
  seasonModelJson: string | null,
  reviews: Array<{ recordId: string; fingerprint: string }>,
): RasterMatchReviewState[] {
  const reviewByRecord = new Map(
    reviews.map((review) => [review.recordId, review.fingerprint]),
  );
  return seasonModelTeams(seasonModelJson).map((team) => {
    const recordId = team.id!;
    const fingerprint = rasterMatchFingerprint(team);
    const reviewedFingerprint = reviewByRecord.get(recordId);
    return {
      recordId,
      label: team.label ?? team.name ?? recordId,
      fingerprint,
      status: reviewedFingerprint === fingerprint ? "settled" : "outstanding",
      reason: !reviewedFingerprint
        ? "never_reviewed"
        : reviewedFingerprint === fingerprint
          ? null
          : "changed",
    };
  });
}

export async function listMatchReviewState(inputSetId: string) {
  const { prisma } = await import("@/lib/db");
  const [inputSet, reviews] = await Promise.all([
    prisma.rasterInputSet.findUnique({
      where: { id: inputSetId },
      select: { seasonModelJson: true },
    }),
    prisma.rasterMatchReview.findMany({
      where: { inputSetId, recordType: RasterMatchRecordType.TEAM },
      select: { recordId: true, fingerprint: true },
    }),
  ]);
  return deriveMatchReviewState(inputSet?.seasonModelJson ?? null, reviews);
}

export async function markMatchReviewRecords(
  inputSetId: string,
  recordIds: string[],
  reviewedById: string,
) {
  const { prisma } = await import("@/lib/db");
  const states = await listMatchReviewState(inputSetId);
  const requested = new Set(recordIds);
  for (const state of states.filter((row) => requested.has(row.recordId))) {
    if (state.status === "settled") continue;
    await prisma.rasterMatchReview.upsert({
      where: {
        inputSetId_recordType_recordId: {
          inputSetId,
          recordType: RasterMatchRecordType.TEAM,
          recordId: state.recordId,
        },
      },
      create: {
        inputSetId,
        recordType: RasterMatchRecordType.TEAM,
        recordId: state.recordId,
        fingerprint: state.fingerprint,
        reviewedById,
      },
      update: {
        fingerprint: state.fingerprint,
        reviewedById,
        reviewedAt: new Date(),
      },
    });
  }
  return listMatchReviewState(inputSetId);
}

function seasonModelTeams(seasonModelJson: string | null): TeamMatchRecord[] {
  if (!seasonModelJson) return [];
  try {
    const parsed = JSON.parse(seasonModelJson) as { teams?: TeamMatchRecord[] };
    return (parsed.teams ?? []).filter((team) => team.id);
  } catch {
    return [];
  }
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
