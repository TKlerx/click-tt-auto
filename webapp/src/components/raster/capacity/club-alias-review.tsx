"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type AliasReviewKind = "CLUB" | "TEAM";
export const aliasReviewActions = ["accept", "override", "create"] as const;
export type AliasReviewAction = (typeof aliasReviewActions)[number];

export type ClubAliasCandidate = {
  capacityRelevant: boolean;
  confirmed?: boolean;
  confidence?: string;
  source?: string;
  kind?: AliasReviewKind;
  modelClubId: string;
  modelClubName: string;
  wishClubId?: string;
  wishClubName?: string;
};

type AliasPayloadTarget = { id: string; name: string };

export function buildAliasReviewPayload(
  candidate: {
    kind?: AliasReviewKind;
    modelClubId?: string;
    modelClubName?: string;
    rawIdentity?: string;
    suggestedIdentity?: string;
    suggestedName?: string;
  },
  action: AliasReviewAction,
  target?: AliasPayloadTarget,
) {
  const selected =
    target ??
    (action === "accept" && candidate.suggestedIdentity
      ? {
          id: candidate.suggestedIdentity,
          name: candidate.suggestedName ?? candidate.suggestedIdentity,
        }
      : undefined);
  if (!selected) throw new Error("A canonical identity is required");
  const rawIdentity = candidate.rawIdentity ?? candidate.modelClubId;
  if (!rawIdentity) throw new Error("A source identity is required");
  return {
    sourceClubId: rawIdentity,
    targetClubId: selected.id,
    canonicalName: selected.name,
    kind: candidate.kind ?? "CLUB",
    createNewIdentity: action === "create",
  };
}

type WishClubOption = {
  clubId: string;
  clubName: string;
  kind?: AliasReviewKind;
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
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [localCandidates, setLocalCandidates] = useState(candidates);
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    initialTargets(candidates),
  );
  const [capacityRelevantOnly, setCapacityRelevantOnly] = useState(false);
  const visibleCandidates = capacityRelevantOnly
    ? localCandidates.filter((candidate) => candidate.capacityRelevant)
    : localCandidates;
  if (!localCandidates.length) return null;

  function refreshSoon() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 600);
  }

  async function apply(
    candidate: ClubAliasCandidate,
    action: AliasReviewAction = "override",
  ) {
    const availableOptions = wishClubOptions.filter(
      (option) => (option.kind ?? "CLUB") === (candidate.kind ?? "CLUB"),
    );
    const selected =
      action === "create"
        ? { clubId: candidate.modelClubId, clubName: candidate.modelClubName }
        : action === "accept" && candidate.wishClubId && candidate.wishClubName
          ? { clubId: candidate.wishClubId, clubName: candidate.wishClubName }
          : availableOptions.find(
              (option) =>
                clubOptionText(option) === targets[aliasReviewKey(candidate)],
            );
    if (!selected) {
      setMessage("Choose a canonical identity from the list.");
      return;
    }
    setBusyIds((current) => ({
      ...current,
      [aliasReviewKey(candidate)]: true,
    }));
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/club-aliases`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildAliasReviewPayload(candidate, action, {
              id: selected.clubId,
              name: selected.clubName,
            }),
          ),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Failed (${response.status})`);
        return;
      }
      setMessage("Mapping saved.");
      setLocalCandidates((current) =>
        current.map((item) =>
          aliasReviewKey(item) === aliasReviewKey(candidate)
            ? {
                ...item,
                confirmed: true,
                wishClubId: selected.clubId,
                wishClubName: selected.clubName,
              }
            : item,
        ),
      );
      refreshSoon();
    } finally {
      setBusyIds((current) => ({
        ...current,
        [aliasReviewKey(candidate)]: false,
      }));
    }
  }

  return (
    <details className="rounded-md border border-[var(--border)] p-3" open>
      <summary className="cursor-pointer text-sm font-medium">
        Source identity mappings to review ({visibleCandidates.length}
        {capacityRelevantOnly ? ` of ${localCandidates.length}` : ""})
      </summary>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Review parsed club and team identities before they can be used for
        validation or a run. Accept the suggestion, choose a different canonical
        identity, or create a new identity.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <input
          checked={capacityRelevantOnly}
          className="h-4 w-4"
          onChange={(event) =>
            setCapacityRelevantOnly(event.currentTarget.checked)
          }
          type="checkbox"
        />
        Show only capacity-relevant clubs
      </label>
      <div className="mt-3 overflow-x-auto">
        {visibleCandidates.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-2">Parsed PDF identity</th>
                <th className="px-2 py-2">Canonical click-TT identity</th>
                <th className="px-2 py-2">Confidence / source</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((candidate) => {
                const busy = busyIds[aliasReviewKey(candidate)] === true;
                const availableOptions = wishClubOptions.filter(
                  (option) =>
                    (option.kind ?? "CLUB") === (candidate.kind ?? "CLUB"),
                );
                return (
                  <tr
                    className="border-t border-[var(--border)]"
                    key={`${aliasReviewKey(candidate)}-${candidate.wishClubId ?? "choose"}`}
                  >
                    <td className="px-2 py-2">
                      <span className="font-medium">
                        {candidate.modelClubName}
                      </span>
                      <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                        {candidate.kind ?? "CLUB"}
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
                        disabled={!canEdit || busy}
                        list={`club-alias-targets-${aliasReviewKey(candidate)}`}
                        value={targets[aliasReviewKey(candidate)] ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setTargets((current) => ({
                            ...current,
                            [aliasReviewKey(candidate)]: value,
                          }));
                        }}
                      />
                      <datalist
                        id={`club-alias-targets-${aliasReviewKey(candidate)}`}
                      >
                        {availableOptions.map((option) => (
                          <option
                            key={option.clubId}
                            value={clubOptionText(option)}
                          />
                        ))}
                      </datalist>
                    </td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)]">
                      {candidate.confidence ?? "review"} /{" "}
                      {candidate.source ?? "cache-sync"}
                    </td>
                    <td className="px-2 py-2">
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                            disabled={
                              busy ||
                              !availableOptions.some(
                                (option) =>
                                  clubOptionText(option) ===
                                  targets[aliasReviewKey(candidate)],
                              )
                            }
                            onClick={() => void apply(candidate)}
                            type="button"
                          >
                            {busy
                              ? "Saving..."
                              : candidate.confirmed
                                ? "Update mapping"
                                : "Choose different identity"}
                          </button>
                          {candidate.wishClubId && candidate.wishClubName ? (
                            <button
                              className="ml-2 h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                              disabled={busy}
                              onClick={() => void apply(candidate, "accept")}
                              type="button"
                            >
                              Accept suggestion
                            </button>
                          ) : null}
                          <button
                            className="ml-2 h-9 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
                            disabled={busy}
                            onClick={() => void apply(candidate, "create")}
                            type="button"
                          >
                            Create new identity
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">
                          Admin required
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No capacity-relevant club mappings to review.
          </p>
        )}
      </div>
      {message ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </details>
  );
}

function aliasReviewKey(candidate: ClubAliasCandidate) {
  return `${candidate.kind ?? "CLUB"}:${candidate.modelClubId}`;
}

function clubOptionText(option: WishClubOption) {
  return `${option.clubName} - ${option.clubId}`;
}

function initialTargets(candidates: ClubAliasCandidate[]) {
  return Object.fromEntries(
    candidates.flatMap((candidate) =>
      candidate.wishClubId && candidate.wishClubName
        ? [
            [
              aliasReviewKey(candidate),
              clubOptionText({
                clubId: candidate.wishClubId,
                clubName: candidate.wishClubName,
              }),
            ],
          ]
        : [],
    ),
  );
}
