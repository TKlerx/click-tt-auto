import { requireSession } from "@/lib/auth";
import {
  assertRasterAccess,
  listAccessibleRasterScopes,
  rasterScopePath,
} from "@/lib/raster/access";
import {
  normalizeRasterSeason,
  rasterSeasonOptions,
} from "@/lib/raster/season";
import {
  GroupModeReview,
  GroupPlanningReview,
  type GroupPlanningReviewRow,
  type GroupModeReviewRow,
} from "@/components/raster/group-mode-review";
import {
  CreateInputSetForm,
  FixedScheduleNumbersForm,
  InputSetRunActions,
} from "@/components/raster/input-set-actions";
import {
  ManualAssignmentForm,
  type ManualAssignmentTeamRow,
} from "@/components/raster/manual-assignment-form";
import { CapacityTable } from "@/components/raster/capacity/capacity-table";
import { InferCapacitiesButton } from "@/components/raster/capacity/infer-capacities-button";
import { ScenarioComparison } from "@/components/raster/scenario-comparison";
import { RasterSourcesPanel } from "@/components/raster/sources/raster-sources-panel";
import { Role } from "../../../../generated/prisma/enums";
import {
  listInputSets,
  listHallCapacities,
  listRasterSourcesForDistrict,
  listScenarios,
  reviewHallCapacitiesForInputSet,
} from "@/services/raster";

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
  requestedRasterzahl: string | null;
};

export default async function RasterPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string; season?: string }>;
}) {
  const user = await requireSession();
  const scopes = await listAccessibleRasterScopes(user);
  const params = await searchParams;
  const district = params.district?.trim() || scopes[0]?.code;
  const season = normalizeRasterSeason(params.season);

  if (!district) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        No Raster districts are configured for your account.
      </div>
    );
  }

  const access = await assertRasterAccess(user, district, "viewer");

  if (access !== true) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        You are not authorized to access Raster data for {district}.
      </div>
    );
  }

  const [inputSets, sources, scenarios, capacities] = await Promise.all([
    listInputSets(district, season),
    listRasterSourcesForDistrict(district, season),
    listScenarios({ district, season }),
    listHallCapacities(district),
  ]);
  const capacityReviews = new Map(
    await Promise.all(
      inputSets.map(
        async (inputSet) =>
          [
            inputSet.id,
            await reviewHallCapacitiesForInputSet(inputSet.id),
          ] as const,
      ),
    ),
  );

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {district}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Raster
        </h1>
        <form className="mt-5 flex max-w-xl gap-2" action="/raster">
          <label className="grid flex-1 gap-1 text-sm font-medium">
            District
            <select
              className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
              defaultValue={district}
              name="district"
            >
              {scopes.map((scope) => (
                <option key={scope.code} value={scope.code}>
                  {rasterScopePath(scope)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid w-36 gap-1 text-sm font-medium">
            Season
            <select
              className="h-10 rounded-md border border-[var(--border)] bg-transparent px-3 text-sm font-normal"
              defaultValue={season}
              name="season"
            >
              {rasterSeasonOptions().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            className="mt-6 h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            type="submit"
          >
            Open
          </button>
        </form>
      </section>

      <RasterSourcesPanel
        canEdit={user.role === Role.PLATFORM_ADMIN}
        district={district}
        inputSet={inputSets[0] ?? null}
        season={season}
        scopes={scopes}
        sources={sources}
      />

      <details className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <summary className="cursor-pointer border-b border-[var(--border)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Gym capacities ({capacities.length})
        </summary>
        <div className="grid gap-3 p-4">
          {user.role === Role.PLATFORM_ADMIN ? (
            <div className="grid gap-2">
              {inputSets.map((inputSet) => {
                const review = capacityReviews.get(inputSet.id);
                if (!review) return null;
                return (
                  <div
                    className="rounded-md border border-[var(--border)] p-3"
                    key={inputSet.id}
                  >
                    <p className="mb-2 text-sm text-[var(--muted-foreground)]">
                      {inputSet.name}: {review.inferredCount} inferred,{" "}
                      {review.missingCount} missing, {review.insufficientCount}{" "}
                      lower than inferred, {review.higherCount} higher than
                      inferred.
                    </p>
                    <InferCapacitiesButton
                      inputSetId={inputSet.id}
                      label={`Recheck capacities for ${inputSet.name}`}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          <CapacityTable
            canEdit={user.role === Role.PLATFORM_ADMIN}
            district={district}
            rows={capacities}
          />
        </div>
      </details>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Input sets
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Fixed Rasterzahlen are optional. You can run a full {district}{" "}
            {season} plan without fixing any team; the optimizer will assign
            Rasterzahlen.
          </p>
        </div>
        {user.role === Role.PLATFORM_ADMIN ? (
          <CreateInputSetForm district={district} season={season} />
        ) : null}
        <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <span>Name</span>
          <span>Status</span>
          <span>Wishes</span>
          <span>Runs</span>
        </div>
        {inputSets.length ? (
          inputSets.map((inputSet) => {
            const sixTeamGroups = extractSixTeamGroups(
              inputSet.id,
              inputSet.seasonModelJson,
            );
            const planningGroups = extractPlanningGroups(
              inputSet.id,
              inputSet.seasonModelJson,
              inputSet.wishes,
            );
            const warnings = extractModelWarnings(inputSet.seasonModelJson);
            return (
              <div
                key={inputSet.id}
                className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
              >
                <div className="grid grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem] gap-3">
                  <span className="font-medium">{inputSet.name}</span>
                  <span>{inputSet.status}</span>
                  <span>{inputSet._count.wishes}</span>
                  <span>{inputSet._count.runs}</span>
                </div>
                {user.role === Role.PLATFORM_ADMIN ? (
                  <FixedScheduleNumbersForm
                    inputSetId={inputSet.id}
                    rows={inputSet.fixedRasterzahlen}
                  />
                ) : null}
                <ModelWarnings warnings={warnings} />
                <GroupPlanningReview
                  key={planningGroups
                    .map((group) => `${group.groupId}:${group.planningStatus}`)
                    .join("|")}
                  groups={planningGroups}
                />
                <GroupModeReview groups={sixTeamGroups} />
                {user.role === Role.PLATFORM_ADMIN ? (
                  <InputSetRunActions
                    capacityReview={capacityReviews.get(inputSet.id)}
                    inputSetId={inputSet.id}
                    runs={inputSet.runs}
                    status={inputSet.status}
                  />
                ) : null}
                {user.role === Role.PLATFORM_ADMIN ? (
                  <ManualAssignmentForm
                    inputSetId={inputSet.id}
                    teams={extractManualAssignmentTeams(
                      inputSet.seasonModelJson,
                    )}
                  />
                ) : null}
                <ScenarioComparison
                  scenarios={scenarios.filter(
                    (scenario) => scenario.inputSetId === inputSet.id,
                  )}
                />
              </div>
            );
          })
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            No input sets.
          </p>
        )}
      </section>
    </div>
  );
}

function extractPlanningGroups(
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
          const candidates = wishCandidatesForTeam(team!, wishes, selectedWish);
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
            wishCandidates: candidates,
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

function isWishIncomplete(team: {
  capacityRelevant?: boolean;
  homeWeekday?: string;
  hall?: string;
  startTime?: string;
  spielwochePref?: string;
}) {
  return team.capacityRelevant === false || missingWishFields(team).length > 0;
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

function extractManualAssignmentTeams(
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

function ModelWarnings({ warnings }: { warnings: string[] }) {
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

function extractModelWarnings(seasonModelJson: string | null): string[] {
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

function extractSixTeamGroups(
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
