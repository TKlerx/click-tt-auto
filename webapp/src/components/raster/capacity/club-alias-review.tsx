"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

type ClubAliasCandidate = {
  confirmed?: boolean;
  modelClubId: string;
  modelClubName: string;
  wishClubId: string;
  wishClubName: string;
};

type WishClubOption = {
  clubId: string;
  clubName: string;
};

export function ClubAliasReview({
  canEdit,
  candidates,
  inputSetId,
  wishClubOptions,
}: {
  canEdit: boolean;
  candidates: ClubAliasCandidate[];
  inputSetId: string;
  wishClubOptions: WishClubOption[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    initialTargets(candidates),
  );
  if (!candidates.length) return null;

  async function apply(candidate: ClubAliasCandidate) {
    const selected = wishClubOptions.find(
      (option) => clubOptionText(option) === targets[candidate.modelClubId],
    );
    if (!selected) {
      setMessage("Choose a wish club from the list.");
      return;
    }
    setBusyId(candidate.modelClubId);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/club-aliases`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceClubId: candidate.modelClubId,
            targetClubId: selected.clubId,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Failed (${response.status})`);
        return;
      }
      setMessage("Mapping saved; capacities refreshed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <details className="rounded-md border border-[var(--border)] p-3" open>
      <summary className="cursor-pointer text-sm font-medium">
        Club mappings to review ({candidates.length})
      </summary>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        These names look like the same club, but the model and wish import use
        different ids. Confirm only when the pair is correct.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <tr>
              <th className="px-2 py-2">Season model</th>
              <th className="px-2 py-2">Map to wish club</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr
                className="border-t border-[var(--border)]"
                key={`${candidate.modelClubId}-${candidate.wishClubId}`}
              >
                <td className="px-2 py-2">
                  <span className="font-medium">
                    {candidate.modelClubName}
                  </span>
                  <br />
                  <span className="text-[var(--muted-foreground)]">
                    {candidate.modelClubId}
                  </span>
                  {candidate.confirmed ? (
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      mapped
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  <input
                    className="h-9 w-full min-w-72 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    disabled={!canEdit || busyId !== null}
                    list={`club-alias-targets-${candidate.modelClubId}`}
                    value={targets[candidate.modelClubId] ?? ""}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setTargets((current) => ({
                        ...current,
                        [candidate.modelClubId]: value,
                      }));
                    }}
                  />
                  <datalist id={`club-alias-targets-${candidate.modelClubId}`}>
                    {wishClubOptions.map((option) => (
                      <option
                        key={option.clubId}
                        value={clubOptionText(option)}
                      />
                    ))}
                  </datalist>
                </td>
                <td className="px-2 py-2">
                  {canEdit ? (
                    <button
                      className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                      disabled={
                        busyId !== null ||
                        !wishClubOptions.some(
                          (option) =>
                            clubOptionText(option) ===
                            targets[candidate.modelClubId],
                        )
                      }
                      onClick={() => void apply(candidate)}
                      type="button"
                    >
                      {busyId === candidate.modelClubId
                        ? "Saving..."
                        : candidate.confirmed
                          ? "Update mapping"
                          : "Map to wish club"}
                    </button>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">
                      Scheduler required
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      ) : null}
    </details>
  );
}

function clubOptionText(option: WishClubOption) {
  return `${option.clubName} - ${option.clubId}`;
}

function initialTargets(candidates: ClubAliasCandidate[]) {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.modelClubId,
      clubOptionText({
        clubId: candidate.wishClubId,
        clubName: candidate.wishClubName,
      }),
    ]),
  );
}
