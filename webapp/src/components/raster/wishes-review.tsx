"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

export type WishReviewRow = {
  id: string;
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

export function WishesReview({
  inputSetId,
  wishes,
}: {
  inputSetId: string;
  wishes: WishReviewRow[];
}) {
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(wish: WishReviewRow) {
    setSavingId(wish.id);
    try {
      await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/wishes/${wish.id}`),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clubId: wish.clubId,
            clubName: wish.clubName,
            teamLabel: wish.teamLabel ?? undefined,
            homeWeekday: wish.homeWeekday,
            hall: wish.hall ?? undefined,
            startTime: wish.startTime ?? undefined,
            spielwochePref: wish.spielwochePref ?? undefined,
            requestedRasterzahl: wish.requestedRasterzahl
              ? JSON.parse(wish.requestedRasterzahl)
              : undefined,
            notes: wish.notes ?? undefined,
          }),
        },
      );
    } finally {
      setSavingId(null);
    }
  }

  if (!wishes.length) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-6 text-sm text-[var(--muted-foreground)]">
        No wishes.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      {wishes.map((wish) => (
        <div
          key={wish.id}
          className="grid grid-cols-[minmax(12rem,1fr)_7rem_5rem] gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
        >
          <span className="font-medium">
            {wish.clubName} {wish.teamLabel}
          </span>
          <span>{wish.homeWeekday}</span>
          <button
            className="rounded border border-[var(--border)] px-2 py-1 text-xs"
            disabled={savingId === wish.id}
            type="button"
            onClick={() => void save(wish)}
          >
            Save
          </button>
        </div>
      ))}
    </div>
  );
}
