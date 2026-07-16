"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
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

type ReviewState = {
  conflicts: {
    id: string;
    wish: WishValues;
    importedRow: WishValues;
    differingFields: string;
  }[];
  unmatchedRows: (WishValues & { id: string })[];
  missingWishes: (WishValues & { id: string })[];
};

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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

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
        setMessage(payload.error ?? `Save failed (${response.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const visibleMissing = showMissing ? review.missingWishes : [];
  if (
    !review.conflicts.length &&
    !review.unmatchedRows.length &&
    !visibleMissing.length
  ) {
    return (
      <p className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        No wish import review items.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Wish import review
      </h2>
      {review.conflicts.length ? (
        <div className="mt-3 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {review.conflicts.length} unresolved conflict
            {review.conflicts.length === 1 ? "" : "s"}.
          </p>
          {review.conflicts.map((conflict) => (
            <div
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={conflict.id}
            >
              <div className="font-medium">{label(conflict.wish)}</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <ValueBlock title="Current" wish={conflict.wish} />
                <ValueBlock title="Imported" wish={conflict.importedRow} />
              </div>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                    disabled={busy !== null}
                    onClick={() =>
                      void post(
                        `/api/raster/input-sets/${inputSetId}/wish-imports/conflicts/${conflict.id}`,
                        { decision: "KEEP_EXISTING" },
                      )
                    }
                    type="button"
                  >
                    {busy?.includes(conflict.id) ? (
                      <BusyLabel label="Saving" />
                    ) : (
                      "Keep current"
                    )}
                  </button>
                  <button
                    className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                    disabled={busy !== null}
                    onClick={() =>
                      void post(
                        `/api/raster/input-sets/${inputSetId}/wish-imports/conflicts/${conflict.id}`,
                        { decision: "USE_IMPORTED" },
                      )
                    }
                    type="button"
                  >
                    Use imported
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {review.unmatchedRows.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {review.unmatchedRows.length} unmatched imported row
            {review.unmatchedRows.length === 1 ? "" : "s"}.
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
                    placeholder="Existing wish id"
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
                    Match
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {visibleMissing.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {visibleMissing.length} active wish
            {visibleMissing.length === 1 ? "" : "es"} missing from current
            imports.
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
                  Still valid
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </section>
  );
}

function ValueBlock({ title, wish }: { title: string; wish: WishValues }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {title}
      </div>
      <div className="mt-1">{formatWish(wish)}</div>
    </div>
  );
}

function label(wish: Pick<WishValues, "clubName" | "teamLabel">) {
  return `${wish.clubName}${wish.teamLabel ? ` ${wish.teamLabel}` : ""}`;
}

function formatWish(wish: WishValues) {
  return [
    wish.homeWeekday,
    wish.startTime,
    wish.hall ? `Gym ${wish.hall}` : "",
    wish.spielwochePref ? `W${wish.spielwochePref}` : "",
    wish.requestedRasterzahl ? `RZ ${wish.requestedRasterzahl}` : "",
    wish.notes,
  ]
    .filter(Boolean)
    .join(", ");
}
