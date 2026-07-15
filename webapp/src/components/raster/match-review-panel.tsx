"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import type { RasterMatchReviewState } from "@/lib/raster/match-review";
import { BusyLabel } from "@/components/ui/busy-label";

export function MatchReviewPanel({
  canEdit,
  inputSetId,
  records,
}: {
  canEdit: boolean;
  inputSetId: string;
  records: RasterMatchReviewState[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const outstanding = records.filter(
    (record) => record.status === "outstanding",
  );

  async function mark(recordIds: string[]) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        withBasePath(`/api/raster/input-sets/${inputSetId}/match-review`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recordIds }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? `Save failed (${response.status})`);
        return;
      }
      setMessage("Match review saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!records.length) return null;

  return (
    <details className="mt-3 border-t border-[var(--border)] pt-3" open>
      <summary className="cursor-pointer text-sm font-medium">
        Source matches ({outstanding.length} outstanding)
      </summary>
      {outstanding.length ? (
        <div className="mt-3 grid gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            Review these source-to-model matches before running. Changed source
            data only reopens the affected teams.
          </p>
          {canEdit ? (
            <button
              className="h-9 w-fit rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              disabled={busy}
              onClick={() =>
                void mark(outstanding.map((record) => record.recordId))
              }
              type="button"
            >
              {busy ? <BusyLabel label="Saving" /> : "Mark all reviewed"}
            </button>
          ) : null}
          {outstanding.map((record) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              key={record.recordId}
            >
              <span>
                {record.label}{" "}
                <span className="text-[var(--muted-foreground)]">
                  {record.reason === "changed" ? "changed" : "not reviewed"}
                </span>
              </span>
              {canEdit ? (
                <button
                  className="h-8 rounded-md border border-[var(--border)] px-2 text-xs font-medium"
                  disabled={busy}
                  onClick={() => void mark([record.recordId])}
                  type="button"
                >
                  Review
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          All source matches are reviewed.
        </p>
      )}
      {message ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{message}</p>
      ) : null}
    </details>
  );
}
