"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type GroupModeReviewRow = {
  inputSetId: string;
  groupId: string;
  label: string;
  rasterMode: "single" | "double" | null;
};

export type GroupPlanningReviewRow = {
  inputSetId: string;
  groupId: string;
  label: string;
  missingTeams: number;
  planningStatus: "include" | "exclude" | null;
  teams: Array<{
    id: string;
    label: string;
    fields: string;
    missing: string;
    spielwochePref: "A" | "B" | null;
    parsedSpielwochePref: "A" | "B" | null;
    selectedWishId: string | null;
    wishMatchSource: "auto" | "manual" | null;
    wishCandidates: Array<{
      id: string;
      label: string;
      fields: string;
      score: number;
    }>;
  }>;
};

export function GroupModeReview({ groups }: { groups: GroupModeReviewRow[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [values, setValues] = useState<
    Record<string, "single" | "double" | "">
  >(() =>
    Object.fromEntries(
      groups.map((group) => [group.groupId, group.rasterMode ?? ""]),
    ),
  );

  async function save(group: GroupModeReviewRow) {
    const rasterMode = values[group.groupId];
    if (rasterMode !== "single" && rasterMode !== "double") {
      setMessages((current) => ({
        ...current,
        [group.groupId]: "Choose a mode",
      }));
      return;
    }
    setSavingId(group.groupId);
    setMessages((current) => ({ ...current, [group.groupId]: "Saving..." }));
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/groups/${encodeURIComponent(group.groupId)}`,
        ),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rasterMode }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Group mode update failed");
      }
      setMessages((current) => ({ ...current, [group.groupId]: "Saved" }));
      router.refresh();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [group.groupId]: error instanceof Error ? error.message : "Save failed",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    setSavingId("__all__");
    for (const group of groups) {
      const rasterMode = values[group.groupId];
      if (rasterMode !== "single" && rasterMode !== "double") {
        setMessages((current) => ({
          ...current,
          [group.groupId]: "Choose a mode",
        }));
        setSavingId(null);
        return;
      }
    }
    try {
      for (const group of groups) {
        await save(group);
      }
    } finally {
      setSavingId(null);
    }
  }

  if (!groups.length) return null;

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Six-team group mode ({groups.length})
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
            disabled={savingId !== null}
            onClick={() => void saveAll()}
            type="button"
          >
            Save all
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Choose whether each 6-team group uses the normal 6er schedule or a 6er
          Doppelrunde, then validate again.
        </p>
        {groups.map((group) => (
          <div
            key={`${group.inputSetId}:${group.groupId}`}
            className="grid grid-cols-[minmax(10rem,1fr)_12rem_5rem_7rem] items-center gap-3 text-sm"
          >
            <span>{group.label}</span>
            <select
              data-group-id={group.groupId}
              data-input-set-id={group.inputSetId}
              data-raster-group-mode=""
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={values[group.groupId] ?? group.rasterMode ?? ""}
              disabled={savingId === group.groupId || savingId === "__all__"}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "single" || value === "double" || value === "") {
                  setValues((current) => ({
                    ...current,
                    [group.groupId]: value,
                  }));
                }
              }}
            >
              <option value="" disabled>
                Select mode
              </option>
              <option value="single">Normal 6er</option>
              <option value="double">6er Doppelrunde</option>
            </select>
            <button
              className="h-9 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
              disabled={savingId === group.groupId || savingId === "__all__"}
              onClick={() => void save(group)}
              type="button"
            >
              Save
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">
              {messages[group.groupId] ?? ""}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function GroupPlanningReview({
  groups,
}: {
  groups: GroupPlanningReviewRow[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<
    Record<string, "include" | "exclude" | "">
  >(() => initialStatuses(groups));
  const [matchCandidates, setMatchCandidates] = useState<
    Record<string, GroupPlanningReviewRow["teams"][number]["wishCandidates"]>
  >(() => initialMatchCandidates(groups));
  const [weekValues, setWeekValues] = useState<Record<string, string>>(() =>
    initialWeekValues(groups),
  );
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [matchValues, setMatchValues] = useState<Record<string, string>>(() =>
    initialMatchValues(groups),
  );
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [savingGroups, setSavingGroups] = useState<Record<string, boolean>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStatuses(initialStatuses(groups));
    setMatchCandidates(initialMatchCandidates(groups));
    setWeekValues(initialWeekValues(groups));
    setMatchValues(initialMatchValues(groups));
  }, [groups]);

  function refreshSoon() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 600);
  }

  async function save(
    group: GroupPlanningReviewRow,
    planningStatus: "include" | "exclude",
  ) {
    setSavingGroups((current) => ({ ...current, [group.groupId]: true }));
    setStatuses((current) => ({ ...current, [group.groupId]: planningStatus }));
    setMessages((current) => ({ ...current, [group.groupId]: "Saving..." }));
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/groups/${encodeURIComponent(group.groupId)}`,
        ),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planningStatus }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Group review update failed");
      }
      setMessages((current) => ({ ...current, [group.groupId]: "Saved" }));
      refreshSoon();
    } catch (error) {
      setStatuses((current) => ({
        ...current,
        [group.groupId]: group.planningStatus ?? "",
      }));
      setMessages((current) => ({
        ...current,
        [group.groupId]: error instanceof Error ? error.message : "Save failed",
      }));
      window.alert(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingGroups((current) => ({ ...current, [group.groupId]: false }));
    }
  }

  async function saveTeamWeek(
    group: GroupPlanningReviewRow,
    teamId: string,
    value: string,
  ) {
    setSavingId(teamId);
    setWeekValues((current) => ({ ...current, [teamId]: value }));
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/teams/${encodeURIComponent(teamId)}`,
        ),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            spielwochePref: value === "A" || value === "B" ? value : null,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Team wish update failed");
      }
      router.refresh();
    } catch (error) {
      setWeekValues((current) => ({
        ...current,
        [teamId]:
          group.teams.find((team) => team.id === teamId)?.spielwochePref ?? "",
      }));
      window.alert(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function applyWish(group: GroupPlanningReviewRow, teamId: string) {
    const team = group.teams.find((candidate) => candidate.id === teamId);
    const candidates = matchCandidates[teamId] ?? team?.wishCandidates ?? [];
    const selected = candidates.find(
      (candidate) => candidateText(candidate) === matchValues[teamId],
    );
    if (!selected) {
      setMessages((current) => ({
        ...current,
        [teamId]: "Choose a PDF match from the list",
      }));
      return;
    }
    setSavingId(teamId);
    setMessages((current) => ({ ...current, [teamId]: "Applying..." }));
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/teams/${encodeURIComponent(teamId)}`,
        ),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wishId: selected.id }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Wish match failed");
      }
      setMessages((current) => ({ ...current, [teamId]: "Applied" }));
      router.refresh();
    } catch (error) {
      setMatchValues((current) => ({
        ...current,
        [teamId]: candidateText(
          (
            matchCandidates[teamId] ??
            group.teams.find((team) => team.id === teamId)?.wishCandidates ??
            []
          ).find(
            (candidate) =>
              candidate.id ===
              group.teams.find((team) => team.id === teamId)?.selectedWishId,
          ),
        ),
      }));
      setMessages((current) => ({
        ...current,
        [teamId]: error instanceof Error ? error.message : "Save failed",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function searchWishes(group: GroupPlanningReviewRow, teamId: string) {
    const query = matchValues[teamId]?.trim();
    if (!query || query.length < 2) return;
    setSearchingId(teamId);
    try {
      const response = await fetch(
        withBasePath(
          `/api/raster/input-sets/${group.inputSetId}/wishes/search?q=${encodeURIComponent(query)}`,
        ),
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Wish search failed");
      }
      const body = (await response.json()) as {
        wishes?: GroupPlanningReviewRow["teams"][number]["wishCandidates"];
      };
      setMatchCandidates((current) => ({
        ...current,
        [teamId]: body.wishes ?? [],
      }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearchingId(null);
    }
  }

  if (!groups.length) return null;

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Group planning and wish matches (
        {
          groups.filter((group) =>
            groupNeedsDecision(group, group.planningStatus ?? ""),
          ).length
        }{" "}
        incomplete / {groups.length} total)
      </summary>
      <div className="mt-2 space-y-2">
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Exclude groups you do not want to plan. Missing A/B stays flexible;
          set it only when the club explicitly requested a rhythm. You can also
          change a PDF match after a mistaken selection. Excluded groups stay
          visible here and can be included again once their wishes arrive.
        </p>
        {groups.map((group) => {
          const status = statuses[group.groupId] ?? group.planningStatus ?? "";
          const needsReview = groupNeedsDecision(group, status);
          const savingGroup = savingGroups[group.groupId] === true;
          return (
            <details
              className={`rounded-md border p-3 ${
                needsReview
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border)]"
              }`}
              key={`${group.inputSetId}:${group.groupId}`}
            >
              <summary className="cursor-pointer">
                <span className="grid grid-cols-[minmax(10rem,1fr)_8rem_7rem_7rem_7rem] items-center gap-3">
                  <span>{group.label}</span>
                  <span
                    className={
                      needsReview ? "font-semibold text-[var(--primary)]" : ""
                    }
                  >
                    {needsReview
                      ? group.missingTeams > 0
                        ? `Needs review: ${group.missingTeams}`
                        : "Needs decision"
                      : "0 missing"}
                  </span>
                  <span>
                    {savingGroup
                      ? "saving"
                      : statusLabel(status, group.missingTeams)}
                    {messages[group.groupId] &&
                    messages[group.groupId] !== "Saving..." ? (
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {messages[group.groupId]}
                      </span>
                    ) : null}
                  </span>
                  <button
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                    disabled={savingGroup}
                    onClick={(event) => {
                      event.preventDefault();
                      void save(group, "include");
                    }}
                    type="button"
                  >
                    Include
                  </button>
                  <button
                    className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                    disabled={savingGroup}
                    onClick={(event) => {
                      event.preventDefault();
                      void save(group, "exclude");
                    }}
                    type="button"
                  >
                    Exclude
                  </button>
                </span>
              </summary>
              <div className="mt-3 overflow-auto">
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead className="text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Team</th>
                    <th className="py-2 pr-3 font-medium">Current fields</th>
                    <th className="py-2 pr-3 font-medium">Missing</th>
                    <th className="py-2 pr-3 font-medium">PDF match</th>
                    <th className="py-2 pr-3 font-medium">Match status</th>
                    <th className="py-2 pr-3 font-medium">Week</th>
                    <th className="py-2 pr-3 font-medium">PDF week</th>
                    <th className="py-2 pr-3 font-medium">Team id</th>
                  </tr>
                </thead>
                <tbody>
                  {group.teams.map((team) => (
                    <tr
                      className="border-t border-[var(--border)]"
                      key={team.id}
                    >
                      <td className="py-2 pr-3">{team.label}</td>
                      <td className="py-2 pr-3">{team.fields}</td>
                      <td className="py-2 pr-3">{team.missing}</td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-2">
                          <input
                            className="h-8 w-72 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                            disabled={savingId === team.id}
                            list={`wish-matches-${team.id}`}
                            placeholder="Search parsed wish"
                            title={matchValues[team.id] ?? ""}
                            value={matchValues[team.id] ?? ""}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setMatchValues((current) => ({
                                ...current,
                                [team.id]: value,
                              }));
                            }}
                          />
                          <datalist id={`wish-matches-${team.id}`}>
                            {(
                              matchCandidates[team.id] ?? team.wishCandidates
                            ).map((candidate) => (
                              <option
                                key={candidate.id}
                                title={candidateText(candidate)}
                                value={candidateText(candidate)}
                              />
                            ))}
                          </datalist>
                          <button
                            className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                            disabled={
                              savingId === team.id || searchingId === team.id
                            }
                            onClick={() => void searchWishes(group, team.id)}
                            type="button"
                          >
                            {searchingId === team.id ? "Searching" : "Search"}
                          </button>
                          <button
                            className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                            disabled={
                              savingId === team.id ||
                              !(
                                matchCandidates[team.id] ?? team.wishCandidates
                              ).some(
                                (candidate) =>
                                  candidateText(candidate) ===
                                  matchValues[team.id],
                              )
                            }
                            onClick={() => void applyWish(group, team.id)}
                            type="button"
                          >
                            {savingId === team.id ? "Applying" : "Apply"}
                          </button>
                        </div>
                        <div className="mt-1 min-h-4 text-[var(--muted-foreground)]">
                          {messages[team.id] ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {team.wishMatchSource ?? "-"}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                          value={
                            weekValues[team.id] ?? team.spielwochePref ?? ""
                          }
                          disabled={savingId === team.id}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            void saveTeamWeek(group, team.id, value);
                          }}
                        >
                          <option value="">No wish</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        {team.parsedSpielwochePref ?? "-"}
                      </td>
                      <td className="py-2 pr-3">{team.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          );
        })}
      </div>
    </details>
  );
}

function candidateText(
  candidate?: { label: string; fields: string; score: number } | null,
) {
  return candidate
    ? `${candidate.label} - ${candidate.fields} (${candidate.score}%)`
    : "";
}

function statusLabel(status: "include" | "exclude" | "", missingTeams: number) {
  if (status === "exclude") return "excluded, deferred";
  if (status === "include") return "included";
  return missingTeams > 0 ? "add wishes or exclude" : "undecided";
}

function groupNeedsDecision(
  group: GroupPlanningReviewRow,
  status: "include" | "exclude" | "",
) {
  return group.missingTeams > 0 || !status;
}

function initialStatuses(groups: GroupPlanningReviewRow[]) {
  return Object.fromEntries(
    groups.map((group) => [group.groupId, group.planningStatus ?? ""]),
  ) as Record<string, "include" | "exclude" | "">;
}

function initialMatchValues(groups: GroupPlanningReviewRow[]) {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.teams.map((team) => [
        team.id,
        candidateText(
          team.wishCandidates.find(
            (candidate) => candidate.id === team.selectedWishId,
          ),
        ),
      ]),
    ),
  );
}

function initialMatchCandidates(groups: GroupPlanningReviewRow[]) {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.teams.map((team) => [team.id, team.wishCandidates]),
    ),
  );
}

function initialWeekValues(groups: GroupPlanningReviewRow[]) {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.teams.map((team) => [team.id, team.spielwochePref ?? ""]),
    ),
  );
}
