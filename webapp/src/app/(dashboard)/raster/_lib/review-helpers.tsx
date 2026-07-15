import type {
  GroupModeReviewRow,
  GroupPlanningReviewRow,
} from "@/components/raster/group-mode-review";
import type { ManualAssignmentTeamRow } from "@/components/raster/manual-assignment-form";

type SeasonGroup = {
  id?: string;
  ref?: { league?: string; name?: string };
  size?: number;
  rasterMode?: "single" | "double";
  planningStatus?: "include" | "exclude";
  teamIds?: string[];
};

type ParsedWishRow = {
  id: string;
  clubId: string;
  clubName: string;
  teamLabel: string | null;
  homeWeekday: string;
  hall: string | null;
  startTime: string | null;
  spielwochePref: string | null;
};

export function extractPlanningGroups(
  inputSetId: string,
  seasonModelJson: string | null,
  wishes: ParsedWishRow[],
): GroupPlanningReviewRow[] {
  if (!seasonModelJson) return [];
  let parsed: {
    groups?: SeasonGroup[];
    teams?: Array<{
      id?: string;
      label?: string;
      name?: string;
      clubId?: string;
      capacityRelevant?: boolean;
      homeWeekday?: string;
      hall?: string;
      startTime?: string;
      spielwochePref?: string;
      wishMatchId?: string;
      wishMatchSource?: "auto" | "manual";
    }>;
  };
  try {
    parsed = JSON.parse(seasonModelJson) as typeof parsed;
  } catch {
    return [];
  }
  const teams = new Map((parsed.teams ?? []).map((team) => [team.id, team]));
  return (parsed.groups ?? [])
    .map((group) => {
      const teamRows = (group.teamIds ?? [])
        .map((teamId) => teams.get(teamId))
        .filter((team) => team?.id)
        .map((team) => {
          const selectedWish = selectedWishForTeam(team!, wishes);
          return {
            id: team!.id!,
            label: team!.label ?? team!.name ?? team!.id!,
            fields: formatWishFields(team!),
            missing: missingWishFields(team!).join(", ") || "-",
            spielwochePref: normalizeWeekSlot(
              team!.spielwochePref ?? selectedWish?.spielwochePref ?? undefined,
            ),
            parsedSpielwochePref: normalizeWeekSlot(
              selectedWish?.spielwochePref ?? undefined,
            ),
            selectedWishId: selectedWish?.id ?? null,
            wishMatchSource:
              team!.wishMatchSource ?? (selectedWish ? "auto" : null),
            wishCandidates: wishCandidatesForTeam(team!, wishes, selectedWish),
          };
        });
      const groupId =
        group.id ??
        [group.ref?.league, group.ref?.name].filter(Boolean).join("::");
      return {
        inputSetId,
        groupId,
        label:
          [group.ref?.league, group.ref?.name].filter(Boolean).join(" / ") ||
          groupId ||
          "Group",
        missingTeams: teamRows.filter((team) => team.missing !== "-").length,
        planningStatus: group.planningStatus ?? null,
        teams: teamRows,
      };
    })
    .filter((group) => group.groupId);
}

export function extractManualAssignmentTeams(
  seasonModelJson: string | null,
): ManualAssignmentTeamRow[] {
  if (!seasonModelJson) return [];
  try {
    const parsed = JSON.parse(seasonModelJson) as {
      teams?: Array<{ id?: string; label?: string; name?: string }>;
    };
    return (parsed.teams ?? [])
      .filter((team) => team.id && (team.label || team.name))
      .map((team) => ({
        teamId: team.id!,
        label: team.label ?? team.name ?? team.id!,
      }));
  } catch {
    return [];
  }
}

export function extractModelWarnings(seasonModelJson: string | null): string[] {
  if (!seasonModelJson) return [];
  try {
    const parsed = JSON.parse(seasonModelJson) as { warnings?: unknown[] };
    return (parsed.warnings ?? []).filter(
      (warning): warning is string => typeof warning === "string",
    );
  } catch {
    return [];
  }
}

export function extractSixTeamGroups(
  inputSetId: string,
  seasonModelJson: string | null,
): GroupModeReviewRow[] {
  if (!seasonModelJson) return [];
  let parsed: { groups?: SeasonGroup[] };
  try {
    parsed = JSON.parse(seasonModelJson) as { groups?: SeasonGroup[] };
  } catch {
    return [];
  }
  return (parsed.groups ?? [])
    .filter((group) => Number(group.size) === 6)
    .map((group) => {
      const groupId =
        group.id ??
        [group.ref?.league, group.ref?.name].filter(Boolean).join("::");
      return {
        inputSetId,
        groupId,
        label:
          [group.ref?.league, group.ref?.name].filter(Boolean).join(" / ") ||
          groupId ||
          "6-team group",
        rasterMode: group.rasterMode ?? null,
      };
    })
    .filter((group) => Boolean(group.groupId));
}

export function ModelWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Model warnings ({warnings.length})
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}

function wishCandidatesForTeam(
  team: { clubId?: string; label?: string; name?: string },
  wishes: ParsedWishRow[],
  selectedWish: ParsedWishRow | null = null,
) {
  const candidates = wishes
    .map((wish) => ({
      wish,
      score:
        similarity(
          normalizeMatchText(team.clubId),
          normalizeMatchText(wish.clubId),
        ) +
        similarity(
          normalizeMatchText(team.name),
          normalizeMatchText(wish.clubName),
        ) +
        similarity(
          normalizeMatchText(team.label),
          normalizeMatchText(wish.teamLabel ?? ""),
        ),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 30)
    .map(({ wish, score }) => ({ wish, score }));
  if (
    selectedWish &&
    !candidates.some((candidate) => candidate.wish.id === selectedWish.id)
  ) {
    candidates.unshift({ wish: selectedWish, score: 999 });
  }
  return candidates.map(({ wish, score }) => ({
    id: wish.id,
    label: `${wish.clubName}${wish.teamLabel ? ` ${wish.teamLabel}` : ""}`,
    fields: formatWishFields({
      homeWeekday: wish.homeWeekday.toLowerCase(),
      hall: wish.hall ?? undefined,
      startTime: wish.startTime ?? undefined,
      spielwochePref: wish.spielwochePref ?? undefined,
    }),
    score: Math.min(100, Math.round((score / 15) * 100)),
  }));
}

function selectedWishForTeam(
  team: {
    clubId?: string;
    label?: string;
    homeWeekday?: string;
    hall?: string;
    startTime?: string;
    spielwochePref?: string;
    wishMatchId?: string;
  },
  wishes: ParsedWishRow[],
) {
  const stored = wishes.find((wish) => wish.id === team.wishMatchId);
  if (stored) return stored;
  return (
    wishes.find(
      (wish) =>
        normalizeMatchText(wish.clubId) === normalizeMatchText(team.clubId) &&
        normalizeMatchText(wish.teamLabel ?? "") ===
          normalizeMatchText(team.label) &&
        wish.homeWeekday.toLowerCase() === team.homeWeekday &&
        (wish.hall ?? "") === (team.hall ?? "") &&
        (wish.startTime ?? "") === (team.startTime ?? "") &&
        (wish.spielwochePref ?? "") === (team.spielwochePref ?? ""),
    ) ?? null
  );
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 3;
  return 0;
}

function normalizeWeekSlot(value?: string): "A" | "B" | null {
  return value === "A" || value === "B" ? value : null;
}

function missingWishFields(team: {
  capacityRelevant?: boolean;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
}) {
  if (team.capacityRelevant === false) return ["wish PDF match"];
  return [
    !team.homeWeekday ? "weekday" : "",
    !team.hall ? "gym" : "",
    !team.startTime ? "start time" : "",
  ].filter(Boolean);
}

function formatWishFields(team: {
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  spielwochePref?: string;
}) {
  return (
    [
      team.homeWeekday,
      team.startTime,
      team.hall ? `Gym ${team.hall}` : "",
      team.spielwochePref ? `W${team.spielwochePref}` : "",
    ]
      .filter(Boolean)
      .join(", ") || "-"
  );
}
