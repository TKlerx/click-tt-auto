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
      inputSets.map(async (inputSet) => [
        inputSet.id,
        await reviewHallCapacitiesForInputSet(inputSet.id),
      ] as const),
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
        season={season}
        scopes={scopes}
        sources={sources}
      />

      <details className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <summary className="cursor-pointer border-b border-[var(--border)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Hall capacities ({capacities.length})
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
                      lower than inferred.
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
