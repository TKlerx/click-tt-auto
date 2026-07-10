import { requireSession } from "@/lib/auth";
import { assertRasterAccess } from "@/lib/raster/access";
import {
  GroupModeReview,
  type GroupModeReviewRow,
} from "@/components/raster/group-mode-review";
import { listInputSets } from "@/services/raster";

type SeasonGroup = {
  id?: string;
  ref?: { league?: string; name?: string };
  size?: number;
  rasterMode?: "single" | "double";
};

export default async function RasterPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const user = await requireSession();
  const district = (await searchParams).district?.trim() || "OWL";
  const access = await assertRasterAccess(user, district, "viewer");

  if (access !== true) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        You are not authorized to access Raster data for {district}.
      </div>
    );
  }

  const inputSets = await listInputSets(district);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {district}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Raster
        </h1>
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
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
                <GroupModeReview groups={sixTeamGroups} />
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
