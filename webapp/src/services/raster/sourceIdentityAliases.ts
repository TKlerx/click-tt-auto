import { prisma } from "@/lib/db";
import { normalizeClubName } from "@/lib/raster/club-matching";

export class SourceIdentityReviewRequiredError extends Error {
  constructor() {
    super("Source identity mappings require review before starting a run.");
  }
}

export type SourceIdentityKind = "CLUB" | "TEAM";
type Candidate = { id: string; name: string };
type AliasInput = {
  scopeId: string;
  season: string;
  kind: SourceIdentityKind;
  rawIdentity: string;
  canonicalIdentity: string;
  canonicalName: string;
  matchConfidence: "EXACT" | "FUZZY" | "MANUAL" | "CREATED";
  source: string;
};

export async function saveSourceIdentityAlias(input: AliasInput) {
  const normalizedSourceName = normalizeClubName(input.rawIdentity);
  const key = {
    scopeId: input.scopeId,
    season: input.season,
    kind: input.kind,
    normalizedSourceName,
  };
  const data = {
    rawSourceName: input.rawIdentity,
    normalizedSourceName,
    canonicalIdentity: input.canonicalIdentity,
    canonicalName: input.canonicalName,
    matchConfidence: input.matchConfidence,
    source: input.source,
    reviewState: "CONFIRMED" as const,
  };
  return prisma.rasterSourceIdentityAlias.upsert({
    where: { scopeId_season_kind_normalizedSourceName: key },
    create: { ...key, ...data },
    update: data,
  });
}

export async function resolveSourceIdentityAlias(input: {
  scopeId: string;
  season: string;
  kind: SourceIdentityKind;
  rawIdentity: string;
  canonicalCandidates: Candidate[];
}) {
  const normalizedSourceName = normalizeClubName(input.rawIdentity);
  const key = {
    scopeId: input.scopeId,
    season: input.season,
    kind: input.kind,
    normalizedSourceName,
  };
  const saved = await prisma.rasterSourceIdentityAlias.findUnique({
    where: { scopeId_season_kind_normalizedSourceName: key },
  });
  if (
    saved?.reviewState === "CONFIRMED" &&
    saved.canonicalIdentity &&
    (saved.matchConfidence === "CREATED" ||
      input.canonicalCandidates.some(
        (candidate) => candidate.id === saved.canonicalIdentity,
      ))
  ) {
    return {
      state: "confirmed" as const,
      canonicalIdentity: saved.canonicalIdentity,
      canonicalName: saved.canonicalName ?? saved.canonicalIdentity,
    };
  }
  // A workspace without the reviewed target must not revoke another workspace's alias.
  if (saved?.reviewState === "CONFIRMED") return { state: "pending" as const };
  const exact = input.canonicalCandidates.filter(
    (candidate) => normalizeClubName(candidate.name) === normalizedSourceName,
  );
  if (exact.length === 1) {
    await saveSourceIdentityAlias({
      ...input,
      canonicalIdentity: exact[0].id,
      canonicalName: exact[0].name,
      matchConfidence: "EXACT",
      source: "cache-sync",
    });
    return {
      state: "confirmed" as const,
      canonicalIdentity: exact[0].id,
      canonicalName: exact[0].name,
    };
  }
  const fuzzy = input.canonicalCandidates.filter((candidate) =>
    isFuzzySourceIdentityMatch(input.rawIdentity, candidate.name),
  );
  const suggested = fuzzy.length === 1 ? fuzzy[0] : undefined;
  await prisma.rasterSourceIdentityAlias.upsert({
    where: { scopeId_season_kind_normalizedSourceName: key },
    create: {
      ...key,
      rawSourceName: input.rawIdentity,
      canonicalIdentity: suggested?.id ?? null,
      canonicalName: suggested?.name ?? null,
      matchConfidence: "FUZZY",
      source: "cache-sync",
      reviewState: "PENDING",
    },
    update: {
      rawSourceName: input.rawIdentity,
      canonicalIdentity: suggested?.id ?? null,
      canonicalName: suggested?.name ?? null,
      matchConfidence: "FUZZY",
      source: "cache-sync",
      reviewState: "PENDING",
    },
  });
  return { state: "pending" as const };
}

function isFuzzySourceIdentityMatch(sourceName: string, candidateName: string) {
  const normalizedSource = normalizeClubName(sourceName);
  const normalizedCandidate = normalizeClubName(candidateName);
  return (
    normalizedSource.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedSource) ||
    sourceIdentityInitials(sourceName) === sourceIdentityInitials(candidateName)
  );
}

function sourceIdentityInitials(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .split(/[^A-Za-z0-9]+/)
    .flatMap((word) => (word.length <= 3 ? [...word] : [word[0] ?? ""]))
    .join("")
    .toLowerCase();
}

export type SourceIdentityReference = {
  kind: SourceIdentityKind;
  normalizedSourceName: string;
};

type IdentityModel = {
  clubs?: Array<{ id: string; name?: string }>;
  teams?: Array<{ id: string; clubId: string; label?: string }>;
  sourceIdentityReferences?: SourceIdentityReference[];
};

export function teamSourceIdentity(clubName: string, label: string) {
  return `${clubName} :: ${label}`;
}

export function sourceIdentityCandidates(
  model: IdentityModel,
  kind: SourceIdentityKind,
) {
  const clubs = model.clubs ?? [];
  if (kind === "CLUB")
    return clubs.map((club) => ({ id: club.id, name: club.name ?? club.id }));
  return (model.teams ?? []).map((team) => ({
    id: team.id,
    name: teamSourceIdentity(
      clubs.find((club) => club.id === team.clubId)?.name ?? team.clubId,
      team.label ?? team.id,
    ),
  }));
}

export async function reviewSourceIdentityAlias(input: {
  inputSetId: string;
  kind: SourceIdentityKind;
  rawIdentity: string;
  targetIdentity?: string;
  createNewIdentity: boolean;
}) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: input.inputSetId },
  });
  if (!inputSet) return null;
  const model = JSON.parse(inputSet.seasonModelJson ?? "{}") as IdentityModel;
  const normalizedSourceName = normalizeClubName(input.rawIdentity);
  if (
    !model.sourceIdentityReferences?.some(
      (ref) =>
        ref.kind === input.kind &&
        ref.normalizedSourceName === normalizedSourceName,
    )
  )
    return null;
  const candidates = sourceIdentityCandidates(model, input.kind);
  if (input.kind === "CLUB") {
    const wishes = await prisma.rasterWish.findMany({
      where: { inputSetId: inputSet.id },
      select: { clubId: true, clubName: true },
    });
    candidates.push(
      ...(wishes ?? []).map((wish) => ({
        id: wish.clubId,
        name: wish.clubName,
      })),
    );
  }
  const target = input.createNewIdentity
    ? { id: input.rawIdentity, name: input.rawIdentity }
    : candidates.find((candidate) => candidate.id === input.targetIdentity);
  if (!target) return null;
  await saveSourceIdentityAlias({
    scopeId: inputSet.scopeId,
    season: inputSet.season,
    kind: input.kind,
    rawIdentity: input.rawIdentity,
    canonicalIdentity: target.id,
    canonicalName: target.name,
    matchConfidence: input.createNewIdentity ? "CREATED" : "MANUAL",
    source: "admin-review",
  });
  return inputSet;
}

export async function unresolvedSourceIdentityAliases(inputSetId: string) {
  const inputSet = await prisma.rasterInputSet.findUnique({
    where: { id: inputSetId },
    select: { scopeId: true, season: true, seasonModelJson: true },
  });
  if (!inputSet) return [];
  const model = JSON.parse(inputSet.seasonModelJson ?? "{}") as IdentityModel;
  const references = model.sourceIdentityReferences ?? [];
  if (!references.length) return [];
  const aliases =
    (await prisma.rasterSourceIdentityAlias.findMany({
      where: {
        scopeId: inputSet.scopeId,
        season: inputSet.season,
        OR: references,
      },
      orderBy: [{ kind: "asc" }, { rawSourceName: "asc" }],
    })) ?? [];
  const wishes = aliases.some(
    (alias) => alias.kind === "CLUB" && alias.reviewState === "CONFIRMED",
  )
    ? ((await prisma.rasterWish.findMany({
        where: { inputSetId },
        select: { clubId: true, clubName: true },
      })) ?? [])
    : [];
  return aliases.flatMap((alias) => {
    if (alias.reviewState !== "CONFIRMED") return [alias];
    if (alias.matchConfidence === "CREATED") return [];
    const targetExists =
      sourceIdentityCandidates(model, alias.kind).some(
        (candidate) => candidate.id === alias.canonicalIdentity,
      ) ||
      (alias.kind === "CLUB" &&
        wishes.some((wish) => wish.clubId === alias.canonicalIdentity));
    return targetExists
      ? []
      : [
          {
            ...alias,
            canonicalIdentity: null,
            canonicalName: null,
            reviewState: "PENDING" as const,
          },
        ];
  });
}

export async function listPendingSourceIdentityAliases(
  scopeId: string,
  season: string,
) {
  return prisma.rasterSourceIdentityAlias.findMany({
    where: { scopeId, season, reviewState: "PENDING" },
    orderBy: [{ kind: "asc" }, { rawSourceName: "asc" }],
  });
}
