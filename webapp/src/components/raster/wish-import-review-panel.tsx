"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { partitionConflicts } from "@/lib/raster/wish-conflicts";
import { BusyLabel } from "@/components/ui/busy-label";

type WishValues = {
  clubId: string;
  clubName: string;
  teamLabel: string | null;
  homeWeekday: string;
  hall: string | null;
  startTime: string | null;
  spielwochePref: string | null;
  requestedRasterzahl: string | null;
  notes: string | null;
};

type Conflict = {
  id: string;
  // MANUAL means an admin set this value by hand, so the import is proposing to
  // undo their work. IMPORTED means the source itself moved.
  wish: WishValues & { origin: string };
  importedRow: WishValues;
  differingFields: string;
};

type ReviewState = {
  conflicts: Conflict[];
  unmatchedRows: (WishValues & { id: string })[];
  addedWishes: (WishValues & { id: string })[];
  settledMatches: {
    id: string;
    kind: "accepted" | "noop";
    decision: string | null;
    wish: WishValues;
    importedRow: WishValues;
  }[];
  missingWishes: (WishValues & { id: string })[];
};

const FILTERS = [
  "all",
  "overwrites",
  "sourceChanged",
  "added",
  "unmatched",
  "missing",
  "settled",
] as const;
type Filter = (typeof FILTERS)[number];

export function WishImportReviewPanel({
  canEdit,
  inputSetId,
  review,
  showMissing = false,
}: {
  canEdit: boolean;
  inputSetId: string;
  review: ReviewState;
  showMissing?: boolean;
}) {
  const t = useTranslations("raster.wishImports");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const shows = (section: Filter) => filter === "all" || filter === section;

  async function post(path: string, body?: unknown) {
    setBusy(path);
    setMessage(null);
    try {
      const response = await fetch(withBasePath(path), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(
          payload.error ?? t("saveFailed", { status: response.status }),
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const visibleMissing = showMissing ? review.missingWishes : [];
  const { overwrites: overwriteConflicts, sourceChanged: sourceConflicts } =
    partitionConflicts(review.conflicts);
  const actionableCount =
    review.conflicts.length +
    review.unmatchedRows.length +
    visibleMissing.length;
  const counts: Record<Filter, number> = {
    all: actionableCount,
    overwrites: overwriteConflicts.length,
    sourceChanged: sourceConflicts.length,
    added: review.addedWishes.length,
    unmatched: review.unmatchedRows.length,
    missing: visibleMissing.length,
    settled: review.settledMatches.length,
  };
  if (
    !actionableCount &&
    !review.addedWishes.length &&
    !review.settledMatches.length
  ) {
    return (
      <p className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        {t("empty")}
      </p>
    );
  }

  return (
    <details
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
      open={actionableCount > 0}
    >
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {t("title")} ({t("toReview", { count: actionableCount })})
      </summary>
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label={t("filterLabel")}
      >
        {FILTERS.filter(
          (option) => option === "all" || option !== "missing" || showMissing,
        ).map((option) => (
          <button
            aria-pressed={filter === option}
            className={`h-8 rounded-md border px-2 text-xs font-medium ${
              filter === option
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
            key={option}
            onClick={() => setFilter(option)}
            type="button"
          >
            {t(`filter.${option}`)} ({counts[option]})
          </button>
        ))}
      </div>
      {shows("overwrites") && overwriteConflicts.length ? (
        <ConflictList
          busy={busy}
          canEdit={canEdit}
          conflicts={overwriteConflicts}
          heading={t("overwritesCount", { count: overwriteConflicts.length })}
          inputSetId={inputSetId}
          post={post}
        />
      ) : null}
      {shows("sourceChanged") && sourceConflicts.length ? (
        <ConflictList
          busy={busy}
          canEdit={canEdit}
          conflicts={sourceConflicts}
          heading={t("sourceChangedCount", { count: sourceConflicts.length })}
          inputSetId={inputSetId}
          post={post}
        />
      ) : null}
      {shows("added") && review.addedWishes.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("addedInfoCount", { count: review.addedWishes.length })}
          </p>
          {review.addedWishes.map((wish) => (
            <div
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={wish.id}
            >
              <span className="font-medium">{label(wish)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {shows("unmatched") && review.unmatchedRows.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("unmatchedCount", { count: review.unmatchedRows.length })}
          </p>
          {review.unmatchedRows.map((row) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={row.id}
            >
              <span>{label(row)}</span>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    className="h-8 rounded-md border border-[var(--border)] bg-transparent px-2 text-xs"
                    onChange={(event) =>
                      setMatches((current) => ({
                        ...current,
                        [row.id]: event.target.value,
                      }))
                    }
                    placeholder={t("existingWishId")}
                    value={matches[row.id] ?? ""}
                  />
                  <button
                    className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                    disabled={busy !== null}
                    onClick={() =>
                      void post(
                        `/api/raster/input-sets/${inputSetId}/wish-imports/rows/${row.id}/match`,
                        { wishId: matches[row.id] || undefined },
                      )
                    }
                    type="button"
                  >
                    {t("match")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {shows("missing") && visibleMissing.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("missingCount", { count: visibleMissing.length })}
          </p>
          {visibleMissing.map((wish) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={wish.id}
            >
              <span>{label(wish)}</span>
              {canEdit ? (
                <button
                  className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                  disabled={busy !== null}
                  onClick={() =>
                    void post(
                      `/api/raster/input-sets/${inputSetId}/wish-imports/missing/${wish.id}`,
                    )
                  }
                  type="button"
                >
                  {t("stillValid")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {shows("settled") && review.settledMatches.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("settledCount", { count: review.settledMatches.length })}
          </p>
          {review.settledMatches.map((match) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={`${match.kind}-${match.id}`}
            >
              <span>{label(match.wish)}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {match.kind === "noop"
                  ? t("noopMatch")
                  : t("acceptedMatch", { decision: match.decision ?? "" })}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </details>
  );
}

function ConflictList({
  busy,
  canEdit,
  conflicts,
  heading,
  inputSetId,
  post,
}: {
  busy: string | null;
  canEdit: boolean;
  conflicts: Conflict[];
  heading: string;
  inputSetId: string;
  post: (path: string, body?: unknown) => Promise<void>;
}) {
  const t = useTranslations("raster.wishImports");
  const decide = (conflictId: string, decision: string) =>
    void post(
      `/api/raster/input-sets/${inputSetId}/wish-imports/conflicts/${conflictId}`,
      { decision },
    );
  return (
    <div className="mt-3 grid gap-2">
      <p className="text-sm text-[var(--muted-foreground)]">{heading}</p>
      {conflicts.map((conflict) => (
        <div
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          key={conflict.id}
        >
          <div className="font-medium">{label(conflict.wish)}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <ValueBlock title={t("current")} wish={conflict.wish} />
            <ValueBlock title={t("imported")} wish={conflict.importedRow} />
          </div>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                disabled={busy !== null}
                onClick={() => decide(conflict.id, "KEEP_EXISTING")}
                type="button"
              >
                {busy?.includes(conflict.id) ? (
                  <BusyLabel label={t("saving")} />
                ) : (
                  t("keepCurrent")
                )}
              </button>
              <button
                className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                disabled={busy !== null}
                onClick={() => decide(conflict.id, "USE_IMPORTED")}
                type="button"
              >
                {t("useImported")}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ValueBlock({ title, wish }: { title: string; wish: WishValues }) {
  const t = useTranslations("raster.wishImports");
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {title}
      </div>
      <div className="mt-1">
        {[
          wish.homeWeekday,
          wish.startTime,
          wish.hall ? t("hallLabel", { hall: wish.hall }) : "",
          // Spielwoche and Rasterzahl are domain codes, identical in every locale.
          wish.spielwochePref ? `W${wish.spielwochePref}` : "",
          wish.requestedRasterzahl ? `RZ ${wish.requestedRasterzahl}` : "",
          wish.notes,
        ]
          .filter(Boolean)
          .join(", ")}
      </div>
    </div>
  );
}

function label(wish: Pick<WishValues, "clubName" | "teamLabel">) {
  return `${wish.clubName}${wish.teamLabel ? ` ${wish.teamLabel}` : ""}`;
}
