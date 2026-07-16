import { closestClubId, normalizeClubName } from "@/lib/raster/club-matching";

type SourceClub = { id?: string; name?: string };
type SourceTeam = {
  clubId?: string;
  label?: string;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  spielwochePref?: string;
};
type SeasonClub = { id?: string; name?: string };
type SeasonTeam = SourceTeam & { id?: string };

export type ProjectionReviewRow = {
  sourceClub: string;
  sourceTeam: string;
  parsed: string;
  matchedTeam: string;
  applied: string;
  status: "matched" | "missing";
};

export function buildProjectionReviewRows(
  sourceJson: string | null,
  seasonModelJson: string | null,
): ProjectionReviewRow[] {
  if (!sourceJson || !seasonModelJson) return [];
  const source = parseJson<{
    clubs?: SourceClub[];
    teams?: SourceTeam[];
  }>(sourceJson);
  const model = parseJson<{
    clubs?: SeasonClub[];
    teams?: SeasonTeam[];
  }>(seasonModelJson);
  if (!source?.teams?.length || !model?.teams?.length) return [];

  const sourceClubs = new Map(
    (source.clubs ?? []).map((club) => [
      club.id ?? "",
      club.name ?? club.id ?? "",
    ]),
  );
  const modelClubs = new Map(
    (model.clubs ?? []).map((club) => [
      normalizeClubName(club.name),
      club.id ?? "",
    ]),
  );
  const modelTeams = new Map(
    model.teams.map((team) => [teamKey(team.clubId, team.label), team]),
  );

  return source.teams.map((team) => {
    const sourceClub = sourceClubs.get(team.clubId ?? "") ?? team.clubId ?? "";
    const modelClubId =
      modelClubs.get(normalizeClubName(sourceClub)) ??
      closestClubId(normalizeClubName(sourceClub), modelClubs) ??
      team.clubId ??
      "";
    const matched =
      modelTeams.get(teamKey(team.clubId, team.label)) ??
      modelTeams.get(teamKey(modelClubId, team.label));

    return {
      sourceClub,
      sourceTeam: team.label ?? "",
      parsed: slotLabel(team),
      matchedTeam: matched?.id ?? "",
      applied: matched ? slotLabel(matched) : "",
      status: matched ? "matched" : "missing",
    };
  });
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function teamKey(clubId?: string, label?: string) {
  return `${clubId ?? ""}|${(label ?? "").trim().toLowerCase()}`;
}

function slotLabel(team: SourceTeam) {
  return [
    team.homeWeekday,
    team.startTime,
    team.hall ? `Gym ${team.hall}` : "",
    team.spielwochePref ? `W${team.spielwochePref}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
